"""Provider-neutral Gmail adapter and compatibility helpers."""

import base64
import io
import re
import socket
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import parsedate_to_datetime, getaddresses, formataddr
from typing import Any

import bleach
from bleach.css_sanitizer import CSSSanitizer
import google.oauth2.credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload


class MailProviderError(RuntimeError):
    code = "PROVIDER_FAILED"
    retryable = True


class InvalidAuthorization(MailProviderError):
    code = "AUTHORIZATION_EXPIRED"
    retryable = False


class ProviderRateLimited(MailProviderError):
    code = "PROVIDER_RATE_LIMITED"


class ProviderTimeout(MailProviderError):
    code = "PROVIDER_TIMEOUT"


class MessageNotFound(MailProviderError):
    code = "MESSAGE_NOT_FOUND"
    retryable = False


class HistoryExpired(MailProviderError):
    code = "SYNC_CURSOR_EXPIRED"


ALLOWED_TAGS = [
    "a", "abbr", "acronym", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4",
    "h5", "h6", "i", "img", "li", "ol", "p", "pre", "s", "span", "strong", "table", "tbody", "td",
    "tfoot", "th", "thead", "tr", "u", "ul",
]
HTML_FORMAT_MARKER = "<!--revomail-html-v4-->"
MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024
CSS_SANITIZER = CSSSanitizer(allowed_css_properties=frozenset({
    "background-color", "border", "border-bottom", "border-collapse", "border-color", "border-left",
    "border-radius", "border-right", "border-spacing", "border-style", "border-top", "border-width", "color",
    "display", "font", "font-family", "font-size", "font-style", "font-weight", "height", "letter-spacing",
    "line-height", "margin", "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height",
    "max-width", "min-height", "min-width", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top", "text-align", "text-decoration", "vertical-align", "white-space", "width", "word-break",
    "word-spacing", "word-wrap",
}))


def _allowed_html_attribute(tag: str, name: str, value: str) -> bool:
    if name == "style":
        return True
    if name in {"align", "aria-hidden", "class", "dir", "hidden", "id", "title"}:
        return True
    if tag == "a" and name == "href":
        return bool(re.match(r"^(?:https?://|mailto:)", value, flags=re.IGNORECASE))
    if tag == "img" and name == "src":
        return bool(re.match(r"^(?:https://|data:image/(?:png|jpeg|gif|webp);base64,)", value, flags=re.IGNORECASE))
    if tag == "img" and name in {"alt", "width", "height"}:
        return True
    if tag in {"table", "td", "th"} and name in {"bgcolor", "border", "cellpadding", "cellspacing", "colspan", "rowspan", "width"}:
        return True
    return False


def _decode_header(value: str) -> str:
    try:
        return str(make_header(decode_header(value)))
    except (LookupError, UnicodeDecodeError):
        return value


def _decode_body(data: str) -> str:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _header(headers: list[dict], name: str) -> str:
    target = name.lower()
    for header in headers:
        if str(header.get("name", "")).lower() == target:
            return _decode_header(str(header.get("value", "")))
    return ""


def _addresses(headers: list[dict], *names: str) -> list[str]:
    values: list[str] = []
    for name in names:
        raw = _header(headers, name)
        if raw:
            values.extend(item.strip() for item in raw.split(",") if item.strip())
    return values


def _attachment_parts(payload: dict) -> list[dict]:
    """Attachment parts in the same order _extract_parts lists them, so an index refers to the same file."""
    if _decode_header(str(payload.get("filename") or "")):
        return [payload]
    mime = str(payload.get("mimeType", ""))
    if mime in ("text/plain", "text/html") and (payload.get("body") or {}).get("data"):
        return []
    found: list[dict] = []
    for part in payload.get("parts") or []:
        found.extend(_attachment_parts(part))
    return found


def _base64url_bytes(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _extract_parts(payload: dict) -> tuple[str, str, list[dict]]:
    mime = str(payload.get("mimeType", ""))
    body = payload.get("body") or {}
    filename = _decode_header(str(payload.get("filename") or ""))
    attachments: list[dict] = []
    if filename:
        attachments.append({"id": body.get("attachmentId"), "filename": filename, "mimeType": mime or "application/octet-stream", "size": int(body.get("size") or 0)})
        return "", "", attachments
    data = str(body.get("data") or "")
    if mime == "text/plain" and data:
        return _decode_body(data), "", attachments
    if mime == "text/html" and data:
        return "", _decode_body(data), attachments
    plain_parts: list[str] = []
    html_parts: list[str] = []
    for part in payload.get("parts") or []:
        plain, html, nested = _extract_parts(part)
        if plain:
            plain_parts.append(plain)
        if html:
            html_parts.append(html)
        attachments.extend(nested)
    return "\n\n".join(plain_parts), "\n".join(html_parts), attachments


def _sanitise_html(html: str) -> str:
    html = re.sub(r"<(script|style|form|iframe|object|embed|svg|math)\b[\s\S]*?</\1\s*>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<(script|style|form|iframe|object|embed|svg|math)\b[^>]*?/?>", "", html, flags=re.IGNORECASE)
    cleaned = bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=_allowed_html_attribute,
        protocols=["http", "https", "mailto", "data"],
        css_sanitizer=CSS_SANITIZER,
        strip=True,
    )
    return HTML_FORMAT_MARKER + cleaned


def _inline_image_data(payload: dict) -> dict[str, str]:
    images: dict[str, str] = {}
    for part in [payload, *(payload.get("parts") or [])]:
        if part is not payload:
            images.update(_inline_image_data(part))
        mime = str(part.get("mimeType") or "").lower()
        if mime not in {"image/png", "image/jpeg", "image/gif", "image/webp"}:
            continue
        content_id = _header(part.get("headers") or [], "Content-ID").strip().strip("<>")
        data = str((part.get("body") or {}).get("data") or "")
        if not content_id or not data:
            continue
        try:
            decoded = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
        except (ValueError, TypeError):
            continue
        if len(decoded) <= MAX_INLINE_IMAGE_BYTES:
            images[content_id] = f"data:{mime};base64,{base64.b64encode(decoded).decode('ascii')}"
    return images


def _replace_inline_images(html: str, payload: dict) -> str:
    for content_id, data_uri in _inline_image_data(payload).items():
        html = re.sub(
            rf"(?i)([\"'])cid:{re.escape(content_id)}\1",
            lambda match: f'{match.group(1)}{data_uri}{match.group(1)}',
            html,
        )
    return html


def mark_read(tokens: dict, message_id: str) -> dict:
    """Remove Gmail's UNREAD label from a message so it shows as read in Gmail as well.

    Requires the gmail.modify scope. Removing an absent label is a no-op, so this is idempotent.
    """
    gmail = _build_gmail(tokens)
    detail = gmail.users().messages().modify(
        userId="me",
        id=message_id,
        body={"removeLabelIds": ["UNREAD"]},
    ).execute()
    return {"id": detail.get("id", message_id), "unread": "UNREAD" in detail.get("labelIds", [])}


def _category(label_ids: list[str]) -> str:
    for label, category in (("CATEGORY_SOCIAL", "Social"), ("CATEGORY_PROMOTIONS", "Promotions"), ("CATEGORY_UPDATES", "Updates"), ("CATEGORY_FORUMS", "Forums")):
        if label in label_ids:
            return category
    return "Primary"


def _received_at(detail: dict, headers: list[dict]) -> str:
    internal = detail.get("internalDate")
    if internal:
        from datetime import datetime, timezone
        return datetime.fromtimestamp(int(internal) / 1000, timezone.utc).isoformat()
    raw = _header(headers, "Date")
    if raw:
        try:
            parsed = parsedate_to_datetime(raw)
            if parsed.tzinfo is None:
                from datetime import timezone
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat()
        except (TypeError, ValueError, OverflowError):
            pass
    from backend.app.persistence import utc_now
    return utc_now().isoformat()


def normalise_message(detail: dict) -> dict:
    payload = detail.get("payload") or {}
    headers = payload.get("headers") or []
    labels = list(detail.get("labelIds") or [])
    plain, html, attachments = _extract_parts(payload)
    return {
        "id": str(detail["id"]), "threadId": detail.get("threadId"), "historyId": detail.get("historyId"),
        "reply_to": reply_recipients(headers, labels), "references": _header(headers, "References"),
        "rfcMessageId": _header(headers, "Message-ID"), "sender": _header(headers, "From"),
        "recipients": _addresses(headers, "To", "Cc", "Bcc"), "subject": _header(headers, "Subject") or "(no subject)",
        "receivedAt": _received_at(detail, headers), "preview": str(detail.get("snippet") or ""),
        "unread": "UNREAD" in labels, "starred": "STARRED" in labels, "category": _category(labels),
        "attachments": attachments, "bodyText": plain,
        "bodyHtmlSafe": _sanitise_html(_replace_inline_images(html, payload)) if html else "",
    }


class GmailAdapter:
    def __init__(self, tokens: dict):
        credentials = google.oauth2.credentials.Credentials(
            token=tokens["token"], refresh_token=tokens.get("refresh_token"), token_uri=tokens["token_uri"],
            client_id=tokens["client_id"], client_secret=tokens["client_secret"], scopes=tokens.get("scopes"),
        )
        self.gmail = build("gmail", "v1", credentials=credentials, cache_discovery=False)

    def _execute(self, request, *, history: bool = False, message_lookup: bool = False):
        try:
            return request.execute()
        except HttpError as exc:
            status = getattr(exc.resp, "status", 0)
            content = bytes(getattr(exc, "content", b"")).lower()
            if history and status == 404:
                raise HistoryExpired() from exc
            if message_lookup and status == 404:
                raise MessageNotFound() from exc
            if status == 429 or b"ratelimit" in content or b"quotaexceeded" in content:
                raise ProviderRateLimited() from exc
            if status in {401, 403}:
                raise InvalidAuthorization() from exc
            raise MailProviderError() from exc
        except (socket.timeout, TimeoutError) as exc:
            raise ProviderTimeout() from exc

    def get_message(self, message_id: str) -> dict:
        detail = self._execute(
            self.gmail.users().messages().get(userId="me", id=message_id, format="full"),
            message_lookup=True,
        )
        self._hydrate_inline_images(detail)
        message = normalise_message(detail)
        message["_inInbox"] = "INBOX" in set(detail.get("labelIds") or [])
        return message

    def _hydrate_inline_images(self, detail: dict) -> None:
        def visit(part: dict) -> None:
            mime = str(part.get("mimeType") or "").lower()
            content_id = _header(part.get("headers") or [], "Content-ID")
            body = part.get("body") or {}
            attachment_id = body.get("attachmentId")
            if (
                mime in {"image/png", "image/jpeg", "image/gif", "image/webp"}
                and content_id
                and attachment_id
                and not body.get("data")
                and int(body.get("size") or 0) <= MAX_INLINE_IMAGE_BYTES
            ):
                attachment = self._execute(
                    self.gmail.users().messages().attachments().get(
                        userId="me", messageId=str(detail["id"]), id=str(attachment_id),
                    ),
                    message_lookup=True,
                )
                if attachment.get("data"):
                    body["data"] = attachment["data"]
                    part["body"] = body
            for child in part.get("parts") or []:
                visit(child)

        visit(detail.get("payload") or {})

    def list_messages(self, limit: int = 50, page_cursor: str | None = None, query: str = "", label_ids: list[str] | None = None) -> dict:
        kwargs: dict[str, Any] = {"userId": "me", "maxResults": limit, "labelIds": label_ids or ["INBOX"]}
        if page_cursor:
            kwargs["pageToken"] = page_cursor
        if query:
            kwargs["q"] = query
        result = self._execute(self.gmail.users().messages().list(**kwargs))
        items = [self.get_message(str(item["id"])) for item in result.get("messages") or []]
        for item in items:
            item.pop("_inInbox", None)
        return {"items": items, "nextCursor": result.get("nextPageToken")}

    def list_history(self, history_id: str, page_cursor: str | None = None) -> dict:
        kwargs: dict[str, Any] = {"userId": "me", "startHistoryId": history_id, "maxResults": 100}
        if page_cursor:
            kwargs["pageToken"] = page_cursor
        result = self._execute(self.gmail.users().history().list(**kwargs), history=True)
        changed: set[str] = set()
        deleted: set[str] = set()
        for record in result.get("history") or []:
            for field in ("messagesAdded", "labelsAdded", "labelsRemoved"):
                for entry in record.get(field) or []:
                    message = entry.get("message") or {}
                    if message.get("id"):
                        changed.add(str(message["id"]))
            for entry in record.get("messagesDeleted") or []:
                message = entry.get("message") or {}
                if message.get("id"):
                    deleted.add(str(message["id"]))
        changed.difference_update(deleted)
        messages: list[dict] = []
        for message_id in changed:
            try:
                message = self.get_message(message_id)
            except MessageNotFound:
                deleted.add(message_id)
                continue
            if message.pop("_inInbox", False):
                messages.append(message)
            else:
                deleted.add(message_id)
        return {"items": messages, "deletedIds": sorted(deleted), "nextCursor": result.get("nextPageToken"), "historyId": str(result.get("historyId") or history_id)}

    def modify_message(self, message_id: str, unread: bool | None = None, starred: bool | None = None) -> dict:
        add: list[str] = []
        remove: list[str] = []
        if unread is not None:
            (add if unread else remove).append("UNREAD")
        if starred is not None:
            (add if starred else remove).append("STARRED")
        result = self._execute(self.gmail.users().messages().modify(userId="me", id=message_id, body={"addLabelIds": add, "removeLabelIds": remove}))
        return {"id": result.get("id", message_id), "unread": unread, "starred": starred}

    def get_attachment(self, message_id: str, index: int) -> dict:
        """Download one attachment, located by its position in the message (Gmail attachment ids are not stable)."""
        detail = self._execute(
            self.gmail.users().messages().get(userId="me", id=message_id, format="full"), message_lookup=True,
        )
        parts = _attachment_parts(detail.get("payload") or {})
        if index < 0 or index >= len(parts):
            raise MessageNotFound()
        part = parts[index]
        body = part.get("body") or {}
        data = body.get("data")
        if not data and body.get("attachmentId"):
            data = self._execute(
                self.gmail.users().messages().attachments().get(userId="me", messageId=message_id, id=str(body["attachmentId"])),
                message_lookup=True,
            ).get("data")
        return {
            "filename": _decode_header(str(part.get("filename") or "")) or "attachment",
            "mimeType": str(part.get("mimeType") or "application/octet-stream"),
            "content": _base64url_bytes(str(data or "")),
        }

    def send_message(self, payload: dict) -> dict:
        message = EmailMessage()
        message["To"] = ", ".join(payload["to"])
        if payload.get("cc"):
            message["Cc"] = ", ".join(payload["cc"])
        if payload.get("bcc"):
            message["Bcc"] = ", ".join(payload["bcc"])
        message["Subject"] = payload["subject"]
        body: dict[str, Any] = {}
        if payload.get("inReplyToMessageId"):
            source = self.get_message(payload["inReplyToMessageId"])
            if source.get("rfcMessageId"):
                message["In-Reply-To"] = source["rfcMessageId"]
                message["References"] = (source.get("references", "") + " " + source["rfcMessageId"]).strip()
            if source.get("threadId"):
                body["threadId"] = source["threadId"]
        message.set_content(payload["bodyText"])
        attachments = payload.get("attachments") or []
        for attachment in attachments:
            maintype, _, subtype = str(attachment.get("mimeType") or "application/octet-stream").partition("/")
            message.add_attachment(
                base64.b64decode(attachment["dataBase64"]),
                maintype=maintype or "application", subtype=subtype or "octet-stream", filename=attachment["filename"],
            )
        if attachments:
            # Messages with files can exceed the size of a plain JSON request, so upload them as a media body.
            media = MediaIoBaseUpload(io.BytesIO(message.as_bytes()), mimetype="message/rfc822", resumable=True)
            request = self.gmail.users().messages().send(userId="me", body=body, media_body=media)
        else:
            body["raw"] = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
            request = self.gmail.users().messages().send(userId="me", body=body)
        try:
            result = self._execute(request)
        except (InvalidAuthorization, ProviderRateLimited):
            raise
        except MailProviderError as exc:
            raise ProviderTimeout() from exc
        return {"providerMessageId": str(result["id"]), "threadId": result.get("threadId")}


def _build_gmail(tokens: dict) -> Any:
    return GmailAdapter(tokens).gmail


def list_messages(tokens: dict, max_results: int = 20, page_token: str | None = None) -> dict:
    page = GmailAdapter(tokens).list_messages(max_results, page_token)
    messages = [{
        "id": item["id"], "thread_id": item.get("threadId"), "sender": item["sender"], "to": ", ".join(item["recipients"]),
        "subject": item["subject"], "date": item["receivedAt"], "preview": item["preview"], "unread": item["unread"],
        "starred": item["starred"], "category": item["category"],
    } for item in page["items"]]
    return {"messages": messages, "next_page_token": page["nextCursor"]}


def get_message(tokens: dict, message_id: str) -> dict:
    item = GmailAdapter(tokens).get_message(message_id)
    return {
        "id": item["id"], "thread_id": item.get("threadId"), "sender": item["sender"], "to": ", ".join(item["recipients"]),
        "subject": item["subject"], "date": item["receivedAt"], "unread": item["unread"], "starred": item["starred"],
        "category": item["category"], "attachments": item["attachments"], "body_plain": item["bodyText"],
        "body_html": item["bodyHtmlSafe"] or None, "body_html_clean": item["bodyHtmlSafe"] or None,
    }


MAX_RECIPIENTS = 50
_ADDRESS_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

class MessageValidationError(ValueError):
    pass

def parse_recipients(raw: str) -> list[str]:
    """Parse and validate a To field. Raises MessageValidationError on anything unsafe or malformed."""
    if not raw or re.search(r"[\r\n\x00]", raw):
        raise MessageValidationError("Enter at least one valid recipient email address.")
    recipients: list[str] = []
    for name, address in getaddresses([raw]):
        address = address.strip()
        if not _ADDRESS_RE.match(address) or re.search(r"[\r\n\x00]", name):
            raise MessageValidationError("One of the recipient email addresses is not valid.")
        recipients.append(formataddr((name, address)) if name else address)
    if not recipients:
        raise MessageValidationError("Enter at least one valid recipient email address.")
    if len(recipients) > MAX_RECIPIENTS:
        raise MessageValidationError(f"A message can have at most {MAX_RECIPIENTS} recipients.")
    return recipients


def reply_recipients(headers: list[dict], label_ids: list[str]) -> list[str]:
    """
    Work out who a reply to this message should go to.

    - A message you sent (SENT label): reply to the people you sent it to.
    - Anything else: Reply-To when the sender set one, otherwise From.
    Returns [] when no valid recipient can be determined.
    """
    if "SENT" in label_ids:
        raw = _header(headers, "To")
    else:
        raw = _header(headers, "Reply-To") or _header(headers, "From")
    try:
        return parse_recipients(raw)
    except MessageValidationError:
        return []


def reply_subject(subject: str) -> str:
    subject = (subject or "").strip()
    if re.match(r"^re:", subject, flags=re.IGNORECASE):
        return subject
    return f"Re: {subject}" if subject else "Re:"


def build_mime(
    to: list[str],
    subject: str,
    body: str,
    in_reply_to: str = "",
    references: str = "",
) -> EmailMessage:
    """Build the outgoing MIME message. Header values containing line breaks are rejected."""
    for value in (subject, in_reply_to, references):
        if re.search(r"[\r\n\x00]", value or ""):
            raise MessageValidationError("The subject contains invalid characters.")
    message = EmailMessage()
    message["To"] = ", ".join(to)
    message["Subject"] = subject
    if in_reply_to:
        message["In-Reply-To"] = in_reply_to
        message["References"] = (references + " " + in_reply_to).strip() if references else in_reply_to
    message.set_content(body)
    return message
