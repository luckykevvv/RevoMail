from typing import Literal

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    code: str
    message: str
    retryable: bool
    correlationId: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class PageInfo(BaseModel):
    nextCursor: str | None = None
    hasMore: bool = False


class OAuthStartResponse(BaseModel):
    authorizationUrl: str


class MailboxMessageSummary(BaseModel):
    id: str
    threadId: str | None = None
    sender: str
    recipients: list[str] = Field(default_factory=list)
    subject: str
    receivedAt: str
    preview: str
    unread: bool
    starred: bool
    category: str | None = None


class MailboxPage(BaseModel):
    items: list[MailboxMessageSummary]
    page: PageInfo


class AiOperationRequest(BaseModel):
    messageIds: list[str] = Field(min_length=1)
    operation: Literal["summary", "overview", "extract", "draft-reply"]


class VoiceCommandRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=2000)
    confirmed: bool = False


class TaskMutationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    dueAt: str | None = None
    confirmed: bool = False
    idempotencyKey: str


class CalendarMutationRequest(BaseModel):
    """Create a Google Calendar event.

    Times are local wall-clock values in `timezone` (an IANA name): "YYYY-MM-DDTHH:MM" for timed events, or
    "YYYY-MM-DD" when `allDay` is true (`endsAt` is then the inclusive last day).
    """

    title: str = Field(min_length=1, max_length=300)
    startsAt: str = Field(max_length=32)
    endsAt: str | None = Field(default=None, max_length=32)
    timezone: str = Field(max_length=64)
    allDay: bool = False
    location: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=2000)
    confirmed: bool = False
    idempotencyKey: str = Field(min_length=8, max_length=128)


class SendEmailRequest(BaseModel):
    """Send a new email, or a reply when replyToMessageId is set (the recipient then comes from that message)."""

    to: str | None = Field(default=None, max_length=2000)
    subject: str = Field(default="", max_length=300)
    body: str = Field(min_length=1, max_length=100_000)
    replyToMessageId: str | None = Field(default=None, max_length=256)
    confirmed: bool = False
    idempotencyKey: str = Field(min_length=8, max_length=128)
