CREATE TABLE "MailboxMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "connectionId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "threadId" TEXT,
  "historyId" TEXT,
  "sender" TEXT NOT NULL,
  "recipients" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "receivedAt" DATETIME NOT NULL,
  "preview" TEXT NOT NULL,
  "unread" INTEGER NOT NULL DEFAULT 0,
  "starred" INTEGER NOT NULL DEFAULT 0,
  "category" TEXT,
  "attachments" TEXT NOT NULL DEFAULT '[]',
  "bodyTextEncrypted" TEXT,
  "bodyHtmlEncrypted" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailboxMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MailboxConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MailboxSyncState" (
  "connectionId" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'IDLE',
  "phase" TEXT NOT NULL DEFAULT 'FULL',
  "pageCursor" TEXT,
  "historyId" TEXT,
  "activeJobId" TEXT,
  "lastSyncedAt" DATETIME,
  "lastErrorCode" TEXT,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailboxSyncState_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MailboxConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MailboxMessage_connection_provider_key" ON "MailboxMessage"("connectionId", "providerMessageId");
CREATE INDEX "MailboxMessage_connection_received_idx" ON "MailboxMessage"("connectionId", "receivedAt" DESC, "id" DESC);
CREATE INDEX "MailboxMessage_connection_flags_idx" ON "MailboxMessage"("connectionId", "unread", "starred", "category");
CREATE INDEX "MailboxSyncState_status_idx" ON "MailboxSyncState"("status");
