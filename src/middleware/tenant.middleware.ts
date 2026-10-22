import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedTenantRequest extends Request {
  tenantId?: string;
}

export function tenantMiddleware(req: AuthenticatedTenantRequest, res: Response, next: NextFunction): void {
  const tenantHeader = req.headers['x-tenant-id'];

  if (!tenantHeader || typeof tenantHeader !== 'string' || !tenantHeader.trim()) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED_TENANT',
        message: 'Missing or invalid required header: x-tenant-id',
      },
    });
    return;
  }

  req.tenantId = tenantHeader.trim();
  next();
}
