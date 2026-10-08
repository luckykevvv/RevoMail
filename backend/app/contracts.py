from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class VoiceContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    view: Literal["inbox", "reading", "reply", "tasks", "calendar", "settings", "starred", "drafts", "sent", "compose"]
    currentMessageId: str | None = Field(default=None, max_length=512)
    followUpMessageId: str | None = Field(default=None, max_length=512)


class VoiceTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["none", "current", "search"] = "none"
    terms: str = Field(default="", max_length=300)
    sender: str = Field(default="", max_length=300)
    subject: str = Field(default="", max_length=500)
    unread: bool | None = None
    starred: bool | None = None
    priority: Literal["high", "medium", "low"] | None = None
    newest: bool = True


class VoiceIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    transcript: str = Field(min_length=1, max_length=2000)
    language: Literal["auto", "en-AU", "en-US", "zh-CN"] = "auto"
    context: VoiceContext


class VoiceIntentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    detectedLanguage: Literal["en", "zh-CN"]
    action: Literal["search_messages", "open_message", "summarize_message", "draft_reply", "extract_details", "show_tasks", "show_calendar", "navigate"]
    target: VoiceTarget = Field(default_factory=VoiceTarget)
    destination: Literal["inbox", "tasks", "calendar", "settings", "starred", "drafts", "sent"] | None = None
    displayText: str = Field(min_length=1, max_length=500)
    confidence: Literal["high", "medium", "low"]

    @model_validator(mode="after")
    def validate_route(self):
        email_actions = {"open_message", "summarize_message", "draft_reply", "extract_details"}
        if self.action in email_actions and self.target.mode == "none":
            raise ValueError("Email actions require a target rule.")
        if self.action == "search_messages" and self.target.mode != "search":
            raise ValueError("Mailbox search requires a search target.")
        if self.action == "navigate" and self.destination is None:
            raise ValueError("Navigation requires a destination.")
        if self.action != "navigate" and self.destination is not None:
            raise ValueError("Only navigation may include a destination.")
        return self


class VoiceSpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=4096)
    language: Literal["en", "zh-CN"] = "en"


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


class MessageStateMutation(BaseModel):
    unread: bool | None = None
    starred: bool | None = None

    @model_validator(mode="after")
    def require_change(self):
        if self.unread is None and self.starred is None:
            raise ValueError("At least one message state must be supplied.")
        return self


class SendEmailRequest(BaseModel):
    to: list[str] = Field(min_length=1, max_length=50)
    cc: list[str] = Field(default_factory=list, max_length=50)
    bcc: list[str] = Field(default_factory=list, max_length=50)
    subject: str = Field(min_length=1, max_length=998)
    bodyText: str = Field(min_length=1, max_length=500_000)
    inReplyToMessageId: str | None = Field(default=None, max_length=512)
    confirmed: Literal[True]
    idempotencyKey: str = Field(min_length=16, max_length=200)

    @model_validator(mode="after")
    def validate_headers(self):
        if "\r" in self.subject or "\n" in self.subject:
            raise ValueError("The subject contains an invalid line break.")
        for address in [*self.to, *self.cc, *self.bcc]:
            if not address or "\r" in address or "\n" in address or "@" not in address:
                raise ValueError("An email address was invalid.")
        return self
