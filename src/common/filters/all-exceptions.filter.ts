import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client';

interface NormalizedError {
  statusCode: number;
  message: string | string[];
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Renders every error with the same JSON shape (see ErrorResponseDto) and
 * maps well-known Prisma errors to proper HTTP statuses instead of 500s.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string | number }>();
    const response = ctx.getResponse<Response>();

    const normalized = this.normalize(exception);
    if (normalized.statusCode >= 500) {
      this.logger.error(
        { err: exception, path: request.url },
        exception instanceof Error ? exception.message : 'Unhandled exception',
      );
    }

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      error: STATUS_CODES[normalized.statusCode] ?? 'Error',
      message: normalized.message,
      ...(normalized.code ? { code: normalized.code } : {}),
      ...(normalized.details ? { details: normalized.details } : {}),
      path: request.originalUrl ?? request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      ...(request.id !== undefined ? { requestId: String(request.id) } : {}),
    });
  }

  normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }
    if (isBodyParserError(exception)) {
      return { statusCode: exception.status, message: 'Malformed request body' };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === 'string') {
      return { statusCode, message: body };
    }
    const { message, code, details } = body as {
      message?: string | string[];
      code?: string;
      details?: Record<string, unknown>;
    };
    if (message === undefined) {
      // Structured payloads without a message (e.g. a failed health check) are kept as details.
      return { statusCode, message: exception.message, details: body as Record<string, unknown> };
    }
    return { statusCode, message, code, details };
  }

  private fromPrismaError(error: Prisma.PrismaClientKnownRequestError): NormalizedError {
    switch (error.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with the same unique value already exists',
          code: 'UNIQUE_CONSTRAINT',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Operation violates a relation constraint',
          code: 'FOREIGN_KEY_CONSTRAINT',
        };
      case 'P2025':
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Record not found', code: 'NOT_FOUND' };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        };
    }
  }
}

function isBodyParserError(error: unknown): error is { status: number; type: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  );
}
