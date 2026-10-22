import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Multi-Tenant Messaging Platform API',
    version: '1.0.0',
    description:
      'Production-grade REST API for a multi-tenant messaging service supporting message dispatch, conversation history pagination, and provider webhook ingestion with idempotency and out-of-order event resilience.',
  },
  servers: [
    {
      url: '/',
      description: 'Current Environment Server',
    },
  ],
  components: {
    securitySchemes: {
      TenantHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-tenant-id',
        description: 'Tenant context identifier representing the authenticated tenant scope',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid request data' },
              issues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
              },
            },
            required: ['code', 'message'],
          },
        },
      },
      MessageStatus: {
        type: 'string',
        enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'],
        example: 'QUEUED',
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'msg_8c8dfa32-159c-4ebc-bf93-67c85244b02d' },
          tenantId: { type: 'string', example: 'tenant-a' },
          conversationId: { type: 'string', example: 'conv-100' },
          to: { type: 'string', example: '+919876543210' },
          text: { type: 'string', example: 'Your order has shipped' },
          status: { $ref: '#/components/schemas/MessageStatus' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          lastEventOccurredAt: { type: 'string', format: 'date-time', nullable: true },
          sentAt: { type: 'string', format: 'date-time', nullable: true },
          deliveredAt: { type: 'string', format: 'date-time', nullable: true },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          failedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      CreateMessageRequest: {
        type: 'object',
        required: ['tenantId', 'conversationId', 'to', 'text'],
        properties: {
          tenantId: { type: 'string', example: 'tenant-a' },
          conversationId: { type: 'string', example: 'conv-100' },
          to: { type: 'string', example: '+919876543210' },
          text: { type: 'string', example: 'Your order has shipped' },
        },
      },
      WebhookPayloadRequest: {
        type: 'object',
        required: ['eventId', 'messageId', 'status', 'occurredAt'],
        properties: {
          eventId: { type: 'string', example: 'evt-001' },
          messageId: { type: 'string', example: 'msg_8c8dfa32-159c-4ebc-bf93-67c85244b02d' },
          status: {
            type: 'string',
            enum: ['SENT', 'DELIVERED', 'READ', 'FAILED'],
            example: 'DELIVERED',
          },
          occurredAt: { type: 'string', format: 'date-time', example: '2026-10-16T08:30:00.000Z' },
        },
      },
      WebhookProcessingResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          duplicate: { type: 'boolean', example: false },
          eventId: { type: 'string', example: 'evt-001' },
          messageId: { type: 'string', example: 'msg_8c8dfa32-159c-4ebc-bf93-67c85244b02d' },
          status: { $ref: '#/components/schemas/MessageStatus' },
          transitionApplied: { type: 'boolean', example: true },
          reason: { type: 'string', example: 'Event was previously processed' },
        },
      },
      PaginatedMessages: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Message' },
          },
          pagination: {
            type: 'object',
            properties: {
              limit: { type: 'integer', example: 20 },
              nextCursor: { type: 'string', nullable: true, example: 'msg_002' },
              hasMore: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Service Health Check',
        description: 'Returns health status and database connectivity indicator without exposing credentials.',
        responses: {
          200: {
            description: 'Service and database are operational',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    uptimeSeconds: { type: 'integer', example: 120 },
                    timestamp: { type: 'string', format: 'date-time' },
                    database: { type: 'string', example: 'connected' },
                  },
                },
              },
            },
          },
          503: {
            description: 'Database disconnected or service degraded',
          },
        },
      },
    },
    '/api/v1/messages': {
      post: {
        summary: 'Create and Queue Message',
        description:
          'Validates payload, verifies matching x-tenant-id context header, persists message with status QUEUED.',
        security: [{ TenantHeader: [] }],
        parameters: [
          {
            name: 'x-tenant-id',
            in: 'header',
            required: true,
            schema: { type: 'string' },
            example: 'tenant-a',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateMessageRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Message created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Message' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          401: {
            description: 'Missing required x-tenant-id header',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          403: {
            description: 'Tenant mismatch or forbidden conversation access',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/v1/messages/{messageId}': {
      get: {
        summary: 'Get Message Details',
        description: 'Retrieves message details, current delivery status, and lifecycle timestamps for the tenant.',
        security: [{ TenantHeader: [] }],
        parameters: [
          {
            name: 'messageId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'x-tenant-id',
            in: 'header',
            required: true,
            schema: { type: 'string' },
            example: 'tenant-a',
          },
        ],
        responses: {
          200: {
            description: 'Message details retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Message' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Missing x-tenant-id header',
          },
          404: {
            description: 'Message not found for the given tenant',
          },
        },
      },
    },
    '/api/v1/conversations/{conversationId}/messages': {
      get: {
        summary: 'Get Conversation Messages with Cursor Pagination',
        description:
          'Retrieves messages in stable chronological order (createdAt ASC, id ASC) using cursor pagination with tenant isolation.',
        security: [{ TenantHeader: [] }],
        parameters: [
          {
            name: 'conversationId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'conv-100',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
          {
            name: 'x-tenant-id',
            in: 'header',
            required: true,
            schema: { type: 'string' },
            example: 'tenant-a',
          },
        ],
        responses: {
          200: {
            description: 'Paginated conversation messages',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedMessages' },
              },
            },
          },
          400: {
            description: 'Invalid cursor or query parameter',
          },
          401: {
            description: 'Missing x-tenant-id header',
          },
          404: {
            description: 'Conversation not found',
          },
        },
      },
    },
    '/api/v1/webhooks/provider': {
      post: {
        summary: 'Provider Webhook Ingestion',
        description:
          'Accepts external delivery-status events. Enforces database-level idempotency on eventId, handles out-of-order events without status regression, and records delivery timestamps.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookPayloadRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Webhook processed successfully or duplicate event safely ignored',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WebhookProcessingResponse' },
              },
            },
          },
          400: {
            description: 'Invalid webhook payload',
          },
          404: {
            description: 'Target messageId not found',
          },
        },
      },
    },
  },
};

export const swaggerDocsRouter = Router();
swaggerDocsRouter.use('/', swaggerUi.serve, swaggerUi.setup(openApiSpec));
export { openApiSpec };
