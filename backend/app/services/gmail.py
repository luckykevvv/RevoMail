"""Provider-neutral Gmail adapter and compatibility helpers."""

import base64
import re
import socket
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from typing import Any

import bleach
import google.oauth2.credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


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
    "th", "thead", "tr", "u", "ul",
]
ALLOWED_ATTRS = {"a": ["title"], "img": ["alt", "width", "height"], "th": ["colspan", "rowspan"], "td": ["colspan", "rowspan"]}


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
    return bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, protocols=[], strip=True)


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
        "rfcMessageId": _header(headers, "Message-ID"), "sender": _header(headers, "From"),
        "recipients": _addresses(headers, "To", "Cc", "Bcc"), "subject": _header(headers, "Subject") or "(no subject)",
        "receivedAt": _received_at(detail, headers), "preview": str(detail.get("snippet") or ""),
        "unread": "UNREAD" in labels, "starred": "STARRED" in labels, "category": _category(labels),
        "attachments": attachments, "bodyText": plain, "bodyHtmlSafe": _sanitise_html(html) if html else "",
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
        message = normalise_message(detail)
        message["_inInbox"] = "INBOX" in set(detail.get("labelIds") or [])
        return message

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
                message["References"] = source["rfcMessageId"]
            if source.get("threadId"):
                body["threadId"] = source["threadId"]
        message.set_content(payload["bodyText"])
        body["raw"] = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
        result = self._execute(self.gmail.users().messages().send(userId="me", body=body))
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
