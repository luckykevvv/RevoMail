"""Transient, provider-neutral email import. Never opens URLs or stores uploads."""
import codecs
import re
from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.errors import AppError

MAX_BODY = 15000
MAX_UPLOAD = 1024 * 1024
MAX_JSON = 256 * 1024


class ManualEmail(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    body: str = Field(min_length=1, max_length=MAX_BODY)
    subject: str = Field(default="", max_length=1000)
    sender: str = Field(default="", max_length=500)
    email_date: str = Field(default="", max_length=128)

    @field_validator("body")
    @classmethod
    def readable_body(cls, value):
        if not value.strip() or any(ord(c) < 32 and c not in "\n\r\t" for c in value):
            raise ValueError("Supply readable, nonempty text.")
        return value

    @field_validator("subject", "sender", "email_date")
    @classmethod
    def single_line(cls, value):
        if any(ord(c) < 32 for c in value):
            raise ValueError("Headers must be single-line text.")
        return value


class TextFromHTML(HTMLParser):
    _BLOCK_TAGS = {
        "address", "article", "aside", "blockquote", "dd", "details", "div", "dl", "dt",
        "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
        "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
        "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
    }
    _VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
    _ALWAYS_HIDDEN = {"script", "style", "head", "template"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden_depth = 0
        self.stack = []

    @staticmethod
    def _hidden_by_attributes(attrs):
        values = {str(name).lower(): "" if value is None else str(value).lower() for name, value in attrs}
        if "hidden" in values or values.get("aria-hidden") == "true":
            return True
        style = re.sub(r"\s+", "", values.get("style", ""))
        return any(marker in style for marker in ("display:none", "visibility:hidden", "mso-hide:all")) or (
            "overflow:hidden" in style and ("max-height:0" in style or "max-width:0" in style)
        )

    def _separator(self):
        if self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        own_hidden = tag in self._ALWAYS_HIDDEN or self._hidden_by_attributes(attrs)
        if own_hidden and tag not in self._VOID_TAGS:
            self.hidden_depth += 1
        if tag not in self._VOID_TAGS:
            self.stack.append((tag, own_hidden))
        if not self.hidden_depth and (tag == "br" or tag in self._BLOCK_TAGS):
            self._separator()

    def handle_endtag(self, tag):
        tag = tag.lower()
        matched = next((index for index in range(len(self.stack) - 1, -1, -1) if self.stack[index][0] == tag), None)
        if matched is None:
            return
        closing = self.stack[matched:]
        del self.stack[matched:]
        was_visible = self.hidden_depth == 0
        self.hidden_depth = max(0, self.hidden_depth - sum(1 for _name, own_hidden in closing if own_hidden))
        if (was_visible or self.hidden_depth == 0) and tag in self._BLOCK_TAGS:
            self._separator()

    def handle_data(self, data):
        if not self.hidden_depth:
            self.parts.append(data)

    def text(self):
        text = "".join(self.parts)
        text = re.sub(r"[\t\f\v ]+", " ", text)
        text = re.sub(r" *\n *", "\n", text)
        return re.sub(r"\n{3,}", "\n\n", text).strip()


def _invalid(message="The file is not a valid text email. Paste its plain text instead."):
    return AppError("MANUAL_INVALID_FILE", message, 422)


def _decode_part(part, warnings):
    payload = part.get_payload(decode=True)
    if payload is None:
        raise _invalid()
    charset = part.get_content_charset() or "utf-8"
    try:
        text = payload.decode(charset)
    except (LookupError, UnicodeError):
        try:
            text = payload.decode("utf-8")
        except UnicodeError:
            text = payload.decode("cp1252", errors="replace")
        warnings.append("An email character encoding was unavailable; review the imported text.")
    if part.defects:
        raise _invalid("An email MIME part is malformed. Export the email again or paste its text.")
    return text


def parse_upload(raw: bytes, format: str) -> dict:
    if not raw:
        raise _invalid("The file is empty.")
    if len(raw) > MAX_UPLOAD:
        raise AppError("MANUAL_TOO_LARGE", "Upload a file no larger than 1 MiB.", 413)
    warnings = []
    values = {"subject": "", "sender": "", "email_date": ""}
    if format == "txt":
        try:
            encoding = "utf-16" if raw.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)) else "utf-8-sig"
            body = raw.decode(encoding)
        except UnicodeError:
            raise _invalid("Use UTF-8 or BOM-marked UTF-16 text, or paste the content.") from None
    elif format == "eml":
        try:
            message = BytesParser(policy=policy.default).parsebytes(raw)
            if message.defects or not any(name in message for name in ("From", "Subject", "To", "Date", "MIME-Version")):
                raise _invalid()
            values = {field: " ".join(str(message.get(header, "")).split())
                      for field, header in (("subject", "Subject"), ("sender", "From"), ("email_date", "Date"))}
            plain, html = [], []
            stack = [(message, 0)]
            count = 0
            while stack:
                part, depth = stack.pop()
                count += 1
                if count > 100 or depth > 20 or part.defects:
                    raise _invalid("The email MIME structure is malformed or too complex.")
                if part.get_content_disposition() == "attachment" or part.get_filename() or part.get_content_maintype() == "message":
                    continue
                if part.is_multipart():
                    stack.extend((child, depth + 1) for child in reversed(part.get_payload()))
                elif part.get_content_type() in {"text/plain", "text/html"}:
                    text = _decode_part(part, warnings)
                    (plain if part.get_content_type() == "text/plain" else html).append(text)
            body = "\n".join(text for text in plain if text.strip())
            if not body.strip() and html:
                parser = TextFromHTML()
                parser.feed("\n".join(html))
                parser.close()
                body = parser.text()
                warnings.append("Imported plain text from HTML; review formatting and missing details.")
        except AppError:
            raise
        except Exception:
            raise _invalid() from None
    else:
        raise AppError("MANUAL_UNSUPPORTED_FILE", "Only .txt and .eml files are supported.", 415)
    if len(body) > MAX_BODY:
        raise AppError("MANUAL_TOO_LARGE", "The decoded email exceeds 15,000 characters. Paste a shorter selection.", 413)
    try:
        email = ManualEmail(body=body, **values)
    except ValueError:
        raise _invalid("The email is empty, contains binary data, or its headers exceed the input limits.") from None
    return {**email.model_dump(), "warnings": list(dict.fromkeys(warnings))}
