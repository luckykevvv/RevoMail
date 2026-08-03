"""
Gmail service — wraps the Google Gmail API.

Responsibilities:
- Build an authenticated Gmail API client from the session tokens.
- List messages (with basic metadata) for the inbox.
- Fetch and parse a single message body (plain-text and HTML).
- Sanitise HTML bodies so scripts / tracking pixels cannot execute.
"""

import base64
import email as email_lib
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
    "*": ["style"],
}


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
    clean = bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
    # Block remote tracking images by replacing src with data-src
    # (the frontend can decide whether to load them)
    return clean.replace(' src="http', ' data-src="http').replace(" src='http", " data-src='http")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_messages(tokens: dict, max_results: int = 20, page_token: str | None = None) -> dict:
    """
    Return a page of inbox messages with metadata only (no bodies).

    Returns:
        {
          "messages": [...],
          "next_page_token": str | None,
        }
    """
    gmail = _build_gmail(tokens)

    kwargs: dict = {
        "userId": "me",
        "labelIds": ["INBOX"],
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
        "body_plain": plain,
        "body_html": _sanitise_html(html) if html else None,
    }


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
