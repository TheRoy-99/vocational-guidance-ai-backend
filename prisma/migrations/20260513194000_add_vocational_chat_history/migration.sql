-- Create conversational history tables for the vocational chatbot.

CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contextSignature" TEXT NOT NULL,
  "topic" TEXT NOT NULL DEFAULT 'VOCATIONAL',
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "chat_conversations_userId_contextSignature_idx"
  ON "chat_conversations"("userId", "contextSignature");

CREATE INDEX IF NOT EXISTS "chat_conversations_userId_updatedAt_idx"
  ON "chat_conversations"("userId", "updatedAt");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "contextSignature" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "normalizedContent" TEXT NOT NULL,
  "turnKey" TEXT NOT NULL,
  "cacheSourceTurnKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "chat_messages_conversationId_createdAt_idx"
  ON "chat_messages"("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "chat_messages_contextSignature_role_idx"
  ON "chat_messages"("contextSignature", "role");

CREATE INDEX IF NOT EXISTS "chat_messages_contextSignature_normalizedContent_idx"
  ON "chat_messages"("contextSignature", "normalizedContent");