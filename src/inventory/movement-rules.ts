import { BadRequestException } from '@nestjs/common';
import type { MovementType } from '../generated/prisma/client';

export interface MovementShape {
  type: MovementType;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  quantity: number;
}

/**
 * Ledger convention: stock leaves `from` and arrives in `to`, quantity is
 * always positive. Mirrors the `stock_movements_warehouse_shape` CHECK
 * constraint so callers get a 400 instead of a database error.
 */
export function assertValidMovementShape(movement: MovementShape): void {
  const { type, fromWarehouseId: from, toWarehouseId: to, quantity } = movement;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BadRequestException('Movement quantity must be a positive integer');
  }

  const valid =
    (type === 'IN' && !from && !!to) ||
    (type === 'OUT' && !!from && !to) ||
    (type === 'TRANSFER' && !!from && !!to && from !== to) ||
    (type === 'ADJUSTMENT' && !!from !== !!to);

  if (!valid) {
    throw new BadRequestException(
      type === 'TRANSFER' && from && from === to
        ? 'Source and destination warehouses must differ'
        : `Invalid warehouse combination for a ${type} movement`,
    );
  }
}
