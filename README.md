# Multi-Tenant Messaging Platform REST API

A production-grade REST API for a multi-tenant messaging platform built with Node.js, TypeScript, Express, Prisma, PostgreSQL (Supabase), and Zod. The service models message queuing, deterministic cursor-based conversation history, tenant isolation, and provider webhook ingestion with database-enforced idempotency and out-of-order event handling.

---

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Architecture & Directory Structure](#architecture--directory-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Supabase Setup & Complete SQL Schema](#supabase-setup--complete-sql-schema)
- [Local Installation & Running](#local-installation--running)
- [Automated Testing](#automated-testing)
- [API Documentation & Swagger UI](#api-documentation--swagger-ui)
- [API Endpoints & Curl Examples](#api-endpoints--curl-examples)
- [Core Engineering Decisions & Design Notes](#core-engineering-decisions--design-notes)
  - [1. Webhook Idempotency](#1-webhook-idempotency)
  - [2. Status Progression & Out-of-Order Events](#2-status-progression--out-of-order-events)
  - [3. Tenant Isolation Strategy](#3-tenant-isolation-strategy)
  - [4. Cursor-Based Pagination](#4-cursor-based-pagination)
  - [5. Concurrency & High-Throughput Scaling](#5-concurrency--high-throughput-scaling)
- [Render Deployment](#render-deployment)
- [Known Limitations](#known-limitations)

---

## Overview

External telecom and OTT messaging providers (such as WhatsApp Business API or SMS aggregators) dispatch webhook events to communicate delivery lifecycles (`SENT`, `DELIVERED`, `READ`, `FAILED`). These webhooks often suffer from:
1. **Network Retries**: Identical events delivered multiple times.
2. **Race Conditions**: Concurrent arrival of duplicate webhook events.
3. **Out-of-Order Delivery**: Fast delivery or read receipts arriving before the initial dispatch event.

This service implements a backend architecture that prevents duplicate business effects, ensures monotonic forward state transitions, and enforces strict tenant boundaries.

---

## Technology Stack

- **Runtime**: Node.js (LTS v20+)
- **Language**: TypeScript 5.7+
- **Web Framework**: Express.js 4.21+
- **Database**: PostgreSQL (Supabase)
- **ORM & Migrations**: Prisma 5.22+
- **Validation**: Zod 3.24+
- **API Documentation**: OpenAPI 3.0 via Swagger UI Express
- **Logging**: Pino & Pino HTTP (structured JSON logging with sensitive data redaction)
- **Security**: Helmet, CORS, body payload limits
- **Testing**: Vitest 3.0+ & Supertest 7.0+
- **Deployment**: Render Web Service

---

## Architecture & Directory Structure

```
messaging-platform-api/
├── .env.example               # Environment template with placeholder values
├── .gitignore                 # Git ignore rules for node_modules, .env, dist
├── package.json               # Dependencies and build scripts
├── tsconfig.json              # TypeScript strict configuration
├── vitest.config.ts           # Vitest test runner configuration
├── render.yaml                # Infrastructure-as-code for Render deployment
├── prisma/
│   ├── schema.prisma          # Prisma schema definition
│   └── supabase_schema.sql    # Pure PostgreSQL migration script for Supabase
├── src/
│   ├── app.ts                 # Express application setup and middleware pipeline
│   ├── server.ts              # HTTP server bootstrap and graceful shutdown
│   ├── config/
│   │   └── env.ts             # Zod-validated runtime environment variables
│   ├── lib/
│   │   ├── prisma.ts          # Prisma Client singleton
│   │   └── logger.ts          # Pino logger with redaction
│   ├── middleware/
│   │   ├── error.middleware.ts# Centralized error handler and RFC 7807 responses
│   │   ├── tenant.middleware.ts # x-tenant-id header extraction and validation
│   │   └── request-logger.ts  # Structured HTTP access logger with correlation IDs
│   ├── validators/
│   │   ├── message.schema.ts  # Zod schema for message creation & pagination
│   │   └── webhook.schema.ts  # Zod schema for provider webhook payloads
│   ├── services/
│   │   ├── message.service.ts # Message creation and retrieval logic
│   │   ├── conversation.service.ts # Keyset cursor pagination logic
│   │   └── webhook.service.ts # Idempotent webhook processor & state machine
│   ├── controllers/
│   │   ├── message.controller.ts
│   │   ├── conversation.controller.ts
│   │   ├── webhook.controller.ts
│   │   └── health.controller.ts
│   ├── routes/
│   │   ├── index.ts           # Central router mounted at /api/v1
│   │   ├── message.routes.ts
│   │   ├── conversation.routes.ts
│   │   ├── webhook.routes.ts
│   │   └── health.routes.ts
│   └── docs/
│       └── swagger.ts         # OpenAPI 3.0 schema and Swagger UI router
└── tests/
    ├── helpers/
    │   └── mock-prisma.ts     # In-memory test store simulating DB constraints
    ├── unit/
    │   └── status-transitions.test.ts # Webhook state machine unit tests
    └── integration/
        ├── health.test.ts
        ├── messages.test.ts
        ├── conversations.test.ts
        ├── webhooks.test.ts
        └── tenant-isolation.test.ts
```

---

## Prerequisites

- Node.js LTS (v20.x or v22.x recommended)
- npm 10.x+
- A Supabase PostgreSQL database project (or local PostgreSQL 15+)

---

## Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Configure your environment variables:

```ini
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Supabase Project Credentials
SUPABASE_URL=https://bdmxfijpakympitpnyum.supabase.co
SUPABASE_KEY=sb_publishable_cP6Js9w-baHQul2diq5GEA_ttqILezF

# Supabase PostgreSQL Connection String
# Replace [YOUR-PASSWORD] with your actual Supabase database password
DATABASE_URL="postgresql://postgres.bdmxfijpakympitpnyum:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.bdmxfijpakympitpnyum.supabase.co:5432/postgres"
```

---

## Supabase Setup & Complete SQL Schema

To set up the database in your Supabase project, navigate to **Supabase Dashboard > SQL Editor**, open a new query, and run the following complete SQL script:

```sql
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

-- 5. Create Webhook Events Table with Idempotency Unique Constraint
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
```

This file is also committed in the repository at [`prisma/supabase_schema.sql`](prisma/supabase_schema.sql).

---

## Local Installation & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Generate Prisma Client**:
   ```bash
   npm run prisma:generate
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```

4. **Build and Run Production Server**:
   ```bash
   npm run build
   npm start
   ```

---

## Automated Testing

The automated test suite uses **Vitest** and **Supertest** to verify all functional requirements, edge cases, status transitions, and tenant boundaries:

```bash
# Run all unit and integration tests
npm test

# Run tests with coverage report
npm run test:coverage
```

### Test Coverage Highlights

- **`tests/unit/status-transitions.test.ts`**: Verifies valid transitions (`QUEUED` -> `SENT` -> `DELIVERED` -> `READ`), terminal state immutability (`FAILED`, `READ`), regression prevention on older events, and timestamp-based arbitration.
- **`tests/integration/health.test.ts`**: Verifies `/health` endpoint and database connection verification.
- **`tests/integration/messages.test.ts`**: Tests message creation, input validation, missing `x-tenant-id` header (401), tenant ID body mismatch (403), message retrieval, and missing message (404).
- **`tests/integration/conversations.test.ts`**: Tests deterministic cursor pagination across multiple pages, cursor tie-breaking (`createdAt ASC, id ASC`), limit bounds, and invalid cursors (400).
- **`tests/integration/webhooks.test.ts`**: Tests full lifecycle progression, duplicate event idempotency (returns 200 without duplicate mutations), out-of-order event handling with delivery timestamp backfilling, unknown message IDs (404), and invalid payloads (400).
- **`tests/integration/tenant-isolation.test.ts`**: Verifies that Tenant B cannot access Tenant A's messages, cannot view Tenant A's conversation history, and cannot hijack conversations belonging to Tenant A.

---

## API Documentation & Swagger UI

Once the service is running, interactive Swagger documentation is accessible at:

```
http://localhost:3000/api-docs
```

The Swagger specification includes schemas, parameter definitions, example payloads, and response codes for every endpoint.

---

## API Endpoints & Curl Examples

### 1. Service Health Check

**Endpoint**: `GET /health`

```bash
curl -i -X GET http://localhost:3000/health
```

**Response (`200 OK`)**:
```json
{
  "status": "ok",
  "uptimeSeconds": 124,
  "timestamp": "2026-10-22T16:30:00.000Z",
  "database": "connected"
}
```

---

### 2. Create Message

**Endpoint**: `POST /api/v1/messages`  
**Headers**: `x-tenant-id: tenant-a`, `Content-Type: application/json`

```bash
curl -i -X POST http://localhost:3000/api/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-a" \
  -d '{
    "tenantId": "tenant-a",
    "conversationId": "conv-100",
    "to": "+919876543210",
    "text": "Your order has shipped"
  }'
```

**Response (`201 Created`)**:
```json
{
  "data": {
    "id": "msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae",
    "tenantId": "tenant-a",
    "conversationId": "conv-100",
    "to": "+919876543210",
    "text": "Your order has shipped",
    "status": "QUEUED",
    "createdAt": "2026-10-22T16:31:00.000Z",
    "updatedAt": "2026-10-22T16:31:00.000Z",
    "lastEventOccurredAt": null,
    "sentAt": null,
    "deliveredAt": null,
    "readAt": null,
    "failedAt": null
  }
}
```

---

### 3. Retrieve Message Details

**Endpoint**: `GET /api/v1/messages/:messageId`  
**Headers**: `x-tenant-id: tenant-a`

```bash
curl -i -X GET http://localhost:3000/api/v1/messages/msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae \
  -H "x-tenant-id: tenant-a"
```

**Response (`200 OK`)**:
```json
{
  "data": {
    "id": "msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae",
    "tenantId": "tenant-a",
    "conversationId": "conv-100",
    "to": "+919876543210",
    "text": "Your order has shipped",
    "status": "QUEUED",
    "createdAt": "2026-10-22T16:31:00.000Z",
    "updatedAt": "2026-10-22T16:31:00.000Z",
    "lastEventOccurredAt": null,
    "sentAt": null,
    "deliveredAt": null,
    "readAt": null,
    "failedAt": null
  }
}
```

---

### 4. Retrieve Conversation History (Cursor Pagination)

**Endpoint**: `GET /api/v1/conversations/:conversationId/messages?limit=20&cursor=...`  
**Headers**: `x-tenant-id: tenant-a`

```bash
# Initial page
curl -i -X GET "http://localhost:3000/api/v1/conversations/conv-100/messages?limit=2" \
  -H "x-tenant-id: tenant-a"

# Subsequent page using nextCursor
curl -i -X GET "http://localhost:3000/api/v1/conversations/conv-100/messages?limit=2&cursor=msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae" \
  -H "x-tenant-id: tenant-a"
```

**Response (`200 OK`)**:
```json
{
  "data": [
    {
      "id": "msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae",
      "tenantId": "tenant-a",
      "conversationId": "conv-100",
      "to": "+919876543210",
      "text": "Your order has shipped",
      "status": "DELIVERED",
      "createdAt": "2026-10-22T16:31:00.000Z"
    }
  ],
  "pagination": {
    "limit": 2,
    "nextCursor": "msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae",
    "hasMore": false
  }
}
```

---

### 5. Ingest Provider Webhook Event

**Endpoint**: `POST /api/v1/webhooks/provider`  
**Headers**: `Content-Type: application/json`

```bash
curl -i -X POST http://localhost:3000/api/v1/webhooks/provider \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-001",
    "messageId": "msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae",
    "status": "DELIVERED",
    "occurredAt": "2026-10-16T08:30:00.000Z"
  }'
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "duplicate": false,
  "eventId": "evt-001",
  "messageId": "msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae",
  "status": "DELIVERED",
  "transitionApplied": true
}
```

**Duplicate Event Replay Response (`200 OK`)**:
```json
{
  "success": true,
  "duplicate": true,
  "eventId": "evt-001",
  "messageId": "msg_01c238b9-509a-4e2b-bbd0-cf4843b092ae",
  "status": "DELIVERED",
  "transitionApplied": false,
  "reason": "Event was previously processed"
}
```

---

## Core Engineering Decisions & Design Notes

### 1. Webhook Idempotency

- **Database-Level Invariance**: A simple application check (`findFirst`) before insertion is vulnerable to concurrent race conditions. Idempotency is enforced by a PostgreSQL `UNIQUE` constraint on `webhook_events(eventId)`.
- **Atomic Concurrency Handling**: When concurrent requests submit the same `eventId`, one succeeds and the other triggers a `P2002` unique constraint violation within the database transaction. The service catches this specific code and safely returns a consistent `200 OK` indicating the event was already processed, eliminating race condition anomalies and partial writes.

### 2. Status Progression & Out-of-Order Events

- **State Hierarchy (Lattice)**:
  `QUEUED (0)` < `SENT (1)` < `DELIVERED (2)` < `READ (3)`
- **Failure State Semantics**: `FAILED` is a terminal failure state. It is permitted only if the message is in `QUEUED` or `SENT`. If a message was already `DELIVERED` or `READ` on a customer's handset, a subsequent `FAILED` event is logically contradictory or stale and is rejected from regressing the message.
- **Timestamp Arbitration**: Each message maintains a `lastEventOccurredAt` timestamp. If an event arrives with an `occurredAt` timestamp strictly older than `lastEventOccurredAt`, the state cannot regress.
- **Timestamp Backfilling**: When an out-of-order event arrives (e.g., `DELIVERED` arrives before `SENT`), the message status progresses directly to `DELIVERED` and `deliveredAt` is recorded. When the delayed `SENT` event eventually arrives, the message status remains `DELIVERED`, but `sentAt` is safely recorded if null.

### 3. Tenant Isolation Strategy

- **Context Header Assumption**: Per the interview specification, the incoming `x-tenant-id` header represents the authenticated tenant context.
- **Strict Boundary Enforcement**:
  - `POST /api/v1/messages`: The body `tenantId` must match `x-tenant-id`. Mismatches are rejected with `403 Forbidden`.
  - `GET /api/v1/messages/:messageId`: The query filters by both `id` and `tenantId`. If the message belongs to another tenant, a `404 Not Found` is returned rather than `403` to prevent cross-tenant enumeration attacks.
  - `GET /api/v1/conversations/:conversationId/messages`: Conversations are isolated per tenant. Conversations created by Tenant A cannot be viewed or appended to by Tenant B.
- **Production Note**: In a production environment, `x-tenant-id` should be replaced by a cryptographically signed JSON Web Token (JWT) or mutual TLS (mTLS) certificate parsed by an API Gateway.

### 4. Cursor-Based Pagination

- **Why Keyset Over Offset**: Traditional `OFFSET` pagination causes $O(N)$ performance degradation on large datasets and produces duplicate or skipped items if new messages are inserted concurrently.
- **Deterministic Keyset Tie-Breaker**:
  Pagination sorts by `createdAt ASC, id ASC`. When fetching subsequent pages with `cursor=<messageId>`, the database executes:
  ```sql
  WHERE tenantId = :tenantId
    AND conversationId = :conversationId
    AND (
      createdAt > :cursorCreatedAt
      OR (createdAt = :cursorCreatedAt AND id > :cursorId)
    )
  ORDER BY createdAt ASC, id ASC
  LIMIT :limit + 1;
  ```
  This query is backed by the composite index `(tenantId, conversationId, createdAt, id)`.

### 5. Concurrency & High-Throughput Scaling

- **Transactional Consistency**: For moderate throughput, all status updates and event recordings run inside `prisma.$transaction`.
- **Scaling to High Throughput**: At scale (tens of thousands of webhooks/sec), direct database transactions on every webhook can saturate connection pools. The architecture can transition to an asynchronous broker design:
  1. Webhooks write immediately to an append-only log or distributed broker (e.g., Apache Kafka, AWS SQS) partitioned by `messageId`.
  2. Partitioning by `messageId` guarantees that events for the same message are processed sequentially by a dedicated consumer group, eliminating database lock contention.
  3. Worker processes consume events with idempotency deduplication checks and write state updates in batch.

---

## Render Deployment

This project includes a declarative `render.yaml` configuration for one-click or automated deployment on Render.

### Render Configuration Steps

1. Create a new **Web Service** on Render and link your GitHub repository.
2. Select **Node** runtime.
3. Configure build and start commands:
   - **Build Command**: `npm install && npm run prisma:generate && npm run build`
   - **Start Command**: `npm run prisma:deploy && npm start`
4. Set Environment Variables in Render:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `DATABASE_URL`: Your Supabase connection string (pooler port 6543)
   - `DIRECT_URL`: Your Supabase direct connection string (port 5432)
   - `SUPABASE_URL`: `https://bdmxfijpakympitpnyum.supabase.co`
   - `SUPABASE_KEY`: Your Supabase key
5. Set the Health Check Path to:
   ```
   /health
   ```

---

## Known Limitations

1. **Brokerless Monolith**: Webhook processing is currently synchronous and transactional. While ideal for consistency without extra infrastructure, high traffic bursts will benefit from an external queue (Kafka/Redis BullMQ).
2. **Authentication Simplicity**: Tenant identity is passed via `x-tenant-id` header as specified in the assignment prompt. Production deployments require JWT validation or API gateway verification.
