from typing import Literal

from pydantic import BaseModel, Field, model_validator


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
    title: str = Field(min_length=1, max_length=300)
    startsAt: str
    endsAt: str | None = None
    timezone: str
    confirmed: bool = False
    idempotencyKey: str


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
