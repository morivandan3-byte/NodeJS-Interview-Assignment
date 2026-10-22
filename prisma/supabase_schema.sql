-- ============================================================
-- Supabase PostgreSQL Schema for Messaging Platform API
-- Project URL: https://bdmxfijpakympitpnyum.supabase.co
-- ============================================================

-- 1. Create Enum for Message Status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageStatus') THEN
        CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');
    END IF;
END$$;

-- 2. Create Tenants Table
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Conversations Table
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "conversations_tenantId_id_key" UNIQUE ("tenantId", "id")
);

-- 4. Create Messages Table
CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventOccurredAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    CONSTRAINT "messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Create Webhook Events Table
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_eventId_key" UNIQUE ("eventId"),
    CONSTRAINT "webhook_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. Create Indexes for High Performance Querying & Tenant Isolation
CREATE INDEX IF NOT EXISTS "messages_tenant_conv_created_idx" 
    ON "messages"("tenantId", "conversationId", "createdAt" ASC, "id" ASC);

CREATE INDEX IF NOT EXISTS "messages_tenantId_idx" 
    ON "messages"("tenantId");

CREATE INDEX IF NOT EXISTS "messages_conversationId_idx" 
    ON "messages"("conversationId");

CREATE INDEX IF NOT EXISTS "webhook_events_messageId_idx" 
    ON "webhook_events"("messageId");
