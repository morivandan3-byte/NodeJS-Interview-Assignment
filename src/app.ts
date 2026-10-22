import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/request-logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import apiRoutes from './routes';
import healthRoutes from './routes/health.routes';
import { swaggerDocsRouter } from './docs/swagger';

export function createApp(): Application {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(requestLogger);

  // Health and API documentation
  app.use('/health', healthRoutes);
  app.use('/api-docs', swaggerDocsRouter);

  // API v1 routes
  app.use('/api/v1', apiRoutes);

  // 404 & Centralized Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
