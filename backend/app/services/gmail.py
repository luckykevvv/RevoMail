"""
Gmail service — wraps the Google Gmail API.

Responsibilities:
- Build an authenticated Gmail API client from the session tokens.
- List messages (with basic metadata, including unread/starred state) for the inbox.
- Fetch and parse a single message body (plain-text and HTML).
- Mark a message as read in Gmail.
- Send a message (new or reply) through Gmail, working out the correct reply recipient.
- Sanitise HTML bodies so scripts / tracking pixels cannot execute.
"""

import base64
import email as email_lib
import re
from email.message import EmailMessage
from email.utils import formataddr, getaddresses
from typing import Any

import bleach
import google.oauth2.credentials
from googleapiclient.discovery import build

# HTML tags and attributes we allow through the sanitiser.
# Everything else (scripts, iframes, forms, event handlers…) is stripped.
ALLOWED_TAGS = list(bleach.sanitizer.ALLOWED_TAGS) + [
    "p", "br", "div", "span", "pre", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
    "strong", "em", "b", "i", "u", "s", "code",
    "img",
]
ALLOWED_ATTRS = {
    **bleach.sanitizer.ALLOWED_ATTRIBUTES,
    "a": ["href", "title"],
    "img": ["src", "alt", "width", "height"],
}


# Mailbox views the inbox API may list. Anything else is rejected by the router.
MAILBOX_LABELS = ("INBOX", "SENT")

MAX_RECIPIENTS = 20
_ADDRESS_RE = re.compile(r"^[^@\s<>,;\"]+@[^@\s<>,;\"]+\.[^@\s<>,;\"]+$")


class MessageValidationError(ValueError):
    """The message cannot be sent as requested (bad recipient, header injection, …)."""


def _build_gmail(tokens: dict) -> Any:
    """Return an authenticated Gmail API client built from stored session tokens."""
    creds = google.oauth2.credentials.Credentials(
        token=tokens["token"],
        refresh_token=tokens.get("refresh_token"),
        token_uri=tokens["token_uri"],
        client_id=tokens["client_id"],
        client_secret=tokens["client_secret"],
        scopes=tokens.get("scopes"),
    )
    return build("gmail", "v1", credentials=creds)


def _decode_body(data: str) -> str:
    """Base64url-decode a Gmail message part body."""
    padded = data + "=" * (4 - len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _extract_parts(payload: dict) -> tuple[str, str]:
    """
    Recursively walk a Gmail message payload and return
    (plain_text, html_text) — either may be empty.

    Handles nested structures like:
      multipart/mixed
        └── multipart/alternative
              ├── text/plain
              └── text/html
    and concatenates all text/plain parts so long threaded emails
    are not silently truncated.
    """
    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime == "text/plain" and body_data:
        return _decode_body(body_data), ""
    if mime == "text/html" and body_data:
        return "", _decode_body(body_data)

    plain_parts: list[str] = []
    html_parts: list[str] = []

    for part in payload.get("parts", []):
        p, h = _extract_parts(part)
        if p:
            plain_parts.append(p)
        if h:
            html_parts.append(h)

    # Prefer the first HTML version found; concatenate all plain parts
    return "\n\n".join(plain_parts), html_parts[0] if html_parts else ""


def _header(headers: list[dict], name: str) -> str:
    """Pull a single header value by name (case-insensitive)."""
    name_lower = name.lower()
    for h in headers:
        if h["name"].lower() == name_lower:
            return h["value"]
    return ""


def _sanitise_html(html: str) -> str:
    """Strip dangerous tags/attributes and block remote images."""
    # Remove <style> and <script> blocks entirely (tag + content).
    # bleach.clean with strip=True removes the tag but leaves the text
    # content, which causes raw CSS to appear as visible text.
    html = re.sub(r"<style[\s\S]*?</style>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.IGNORECASE)

    clean = bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)

    return clean


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_messages(
    tokens: dict,
    max_results: int = 20,
    page_token: str | None = None,
    label: str = "INBOX",
) -> dict:
    """
    Return a page of messages for one mailbox view (INBOX or SENT) with metadata only (no bodies).

    Returns:
        {
          "messages": [...],
          "next_page_token": str | None,
        }
    """
    if label not in MAILBOX_LABELS:
        raise ValueError("Unsupported mailbox label.")
    gmail = _build_gmail(tokens)

    kwargs: dict = {
        "userId": "me",
        "labelIds": [label],
        "maxResults": max_results,
    }
    if page_token:
        kwargs["pageToken"] = page_token

    result = gmail.users().messages().list(**kwargs).execute()
    raw_messages = result.get("messages", [])
    next_page_token = result.get("nextPageToken")

    messages = []
    for msg in raw_messages:
        # Fetch metadata fields only — much cheaper than full message
        detail = gmail.users().messages().get(
            userId="me",
            id=msg["id"],
            format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"],
        ).execute()

        headers = detail.get("payload", {}).get("headers", [])
        snippet = detail.get("snippet", "")
        label_ids = detail.get("labelIds", [])

        messages.append({
            "id": detail["id"],
            "thread_id": detail.get("threadId"),
            "sender": _header(headers, "From"),
            "to": _header(headers, "To"),
            "subject": _header(headers, "Subject") or "(no subject)",
            "date": _header(headers, "Date"),
            "preview": snippet,
            "unread": "UNREAD" in label_ids,
            "starred": "STARRED" in label_ids,
            "category": _category(label_ids),
        })

    return {"messages": messages, "next_page_token": next_page_token}


def get_message(tokens: dict, message_id: str) -> dict:
    """
    Return the full content of a single message, with a sanitised HTML body.
    """
    gmail = _build_gmail(tokens)
    detail = gmail.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
    ).execute()

    headers = detail.get("payload", {}).get("headers", [])
    label_ids = detail.get("labelIds", [])
    plain, html = _extract_parts(detail.get("payload", {}))

    return {
        "id": detail["id"],
        "thread_id": detail.get("threadId"),
        "sender": _header(headers, "From"),
        "to": _header(headers, "To"),
        "subject": _header(headers, "Subject") or "(no subject)",
        "date": _header(headers, "Date"),
        "unread": "UNREAD" in label_ids,
        "starred": "STARRED" in label_ids,
        "category": _category(label_ids),
        "reply_to": reply_recipients(headers, label_ids),
        "body_plain": plain,
        "body_html": _sanitise_html(html) if html else None,
        "body_html_clean": _sanitise_html(html) if html else None,
    }


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


def send_message(
    tokens: dict,
    to: str | None,
    subject: str,
    body: str,
    reply_to_message_id: str | None = None,
) -> dict:
    """
    Send a message through Gmail. Requires the gmail.send scope.

    For a reply the recipient is taken from the original message (Reply-To, else From; the
    original's To for a message you sent) — never from client input — and the reply is placed in the
    same Gmail thread with In-Reply-To/References set.
    """
    gmail = _build_gmail(tokens)
    thread_id = None
    in_reply_to = ""
    references = ""

    if reply_to_message_id:
        original = gmail.users().messages().get(
            userId="me",
            id=reply_to_message_id,
            format="metadata",
            metadataHeaders=["From", "To", "Reply-To", "Subject", "Message-ID", "References"],
        ).execute()
        headers = original.get("payload", {}).get("headers", [])
        recipients = reply_recipients(headers, original.get("labelIds", []))
        if not recipients:
            raise MessageValidationError("This message has no valid address to reply to.")
        subject = subject.strip() or reply_subject(_header(headers, "Subject"))
        thread_id = original.get("threadId")
        in_reply_to = _header(headers, "Message-ID").strip()
        references = _header(headers, "References").strip()
    else:
        recipients = parse_recipients(to or "")

    message = build_mime(recipients, subject, body, in_reply_to, references)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    request_body: dict = {"raw": raw}
    if thread_id:
        request_body["threadId"] = thread_id
    sent = gmail.users().messages().send(userId="me", body=request_body).execute()
    return {"id": sent.get("id"), "thread_id": sent.get("threadId", thread_id)}


def _category(label_ids: list[str]) -> str:
    """Map Gmail category labels to a simple category string."""
    if "CATEGORY_SOCIAL" in label_ids:
        return "Social"
    if "CATEGORY_PROMOTIONS" in label_ids:
        return "Promotions"
    if "CATEGORY_UPDATES" in label_ids:
        return "Updates"
    if "CATEGORY_FORUMS" in label_ids:
        return "Forums"
    return "Primary"
