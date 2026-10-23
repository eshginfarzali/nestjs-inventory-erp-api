import { HttpException, HttpStatus } from '@nestjs/common';

export interface DomainErrorBody {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

/**
 * Business-rule violation with a stable machine-readable `code` that clients
 * can switch on, rendered by AllExceptionsFilter.
 */
export class DomainException extends HttpException {
  constructor(status: HttpStatus, body: DomainErrorBody) {
    super(body, status);
  }
}

export class InsufficientStockException extends DomainException {
  constructor(details: {
    productId: string;
    warehouseId: string;
    requested: number;
    available: number;
  }) {
    super(HttpStatus.CONFLICT, {
      message: `Insufficient stock: requested ${details.requested}, available ${details.available}`,
      code: 'INSUFFICIENT_STOCK',
      details,
    });
  }
}

export class InvalidStatusTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super(HttpStatus.CONFLICT, {
      message: `Cannot change production order status from ${from} to ${to}`,
      code: 'INVALID_STATUS_TRANSITION',
      details: { from, to },
    });
  }
}
