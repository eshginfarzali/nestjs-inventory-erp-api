import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InsufficientStockException } from '../common/exceptions/domain.exception';
import type { MovementType, StockMovement } from '../generated/prisma/client';
import type { Tx } from '../prisma/prisma.types';
import type { StockChange } from '../notifications/low-stock.rules';
import { assertValidMovementShape } from './movement-rules';

export interface MovementInput {
  type: MovementType;
  productId: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  quantity: number;
  reason?: string;
  reference?: string;
  productionOrderId?: string;
  createdById: string;
}

export interface MovementResult {
  movement: StockMovement;
  changes: StockChange[];
}

/**
 * The single write path for stock. Every method takes the caller's
 * transaction client so that level updates and the ledger row commit (or roll
 * back) together, possibly alongside other domain writes (e.g. a production
 * order completion).
 *
 * Negative stock is prevented by a conditional `UPDATE ... WHERE quantity >= n`:
 * the row lock taken by the update serialises concurrent withdrawals, and a
 * zero row count means there was not enough stock. A CHECK (quantity >= 0)
 * constraint backs this up at the database level.
 */
@Injectable()
export class StockLedgerService {
  async record(tx: Tx, input: MovementInput): Promise<MovementResult> {
    assertValidMovementShape(input);

    const product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product) {
      throw new NotFoundException(`Product ${input.productId} not found`);
    }
    if (!product.isActive) {
      throw new ConflictException(`Product ${product.sku} is inactive`);
    }
    for (const warehouseId of [input.fromWarehouseId, input.toWarehouseId]) {
      if (warehouseId) {
        await this.assertActiveWarehouse(tx, warehouseId);
      }
    }

    // Touch rows in a deterministic order (by warehouse id) so that concurrent
    // opposite transfers cannot deadlock on each other's row locks.
    const operations = [
      ...(input.fromWarehouseId ? [{ warehouseId: input.fromWarehouseId, sign: -1 as const }] : []),
      ...(input.toWarehouseId ? [{ warehouseId: input.toWarehouseId, sign: 1 as const }] : []),
    ].sort((a, b) => a.warehouseId.localeCompare(b.warehouseId));

    const changes: StockChange[] = [];
    for (const op of operations) {
      const balance =
        op.sign < 0
          ? await this.decrease(tx, input.productId, op.warehouseId, input.quantity)
          : await this.increase(tx, input.productId, op.warehouseId, input.quantity);
      changes.push({
        productId: input.productId,
        warehouseId: op.warehouseId,
        reorderLevel: product.reorderLevel,
        ...balance,
      });
    }

    const movement = await tx.stockMovement.create({ data: input });
    return { movement, changes };
  }

  async increase(
    tx: Tx,
    productId: string,
    warehouseId: string,
    quantity: number,
  ): Promise<{ before: number; after: number }> {
    // Compiles to INSERT ... ON CONFLICT DO UPDATE, safe under concurrency.
    const level = await tx.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      create: { productId, warehouseId, quantity },
      update: { quantity: { increment: quantity } },
    });
    return { before: level.quantity - quantity, after: level.quantity };
  }

  async decrease(
    tx: Tx,
    productId: string,
    warehouseId: string,
    quantity: number,
  ): Promise<{ before: number; after: number }> {
    const { count } = await tx.stockLevel.updateMany({
      where: { productId, warehouseId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });

    const level = await tx.stockLevel.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
    });
    if (count === 0 || !level) {
      throw new InsufficientStockException({
        productId,
        warehouseId,
        requested: quantity,
        available: level?.quantity ?? 0,
      });
    }
    return { before: level.quantity + quantity, after: level.quantity };
  }

  private async assertActiveWarehouse(tx: Tx, warehouseId: string): Promise<void> {
    const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${warehouseId} not found`);
    }
    if (!warehouse.isActive) {
      throw new ConflictException(`Warehouse ${warehouse.code} is inactive`);
    }
  }
}
