import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode ?? 500;
  const message = statusCode === 500 ? 'Internal Server Error' : err.message;

  if (statusCode === 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({ error: message });
};
