import { ConflictException, NotFoundException } from '@nestjs/common';
import { InsufficientStockException } from '../common/exceptions/domain.exception';
import type { Tx } from '../prisma/prisma.types';
import { StockLedgerService } from './stock-ledger.service';

const PRODUCT = { id: 'p1', sku: 'BOLT', isActive: true, reorderLevel: 10 };

/** In-memory stand-in for the transaction client, enforcing the same conditional update. */
function createTx(levels: Record<string, number>) {
  const key = (productId: string, warehouseId: string) => `${productId}:${warehouseId}`;
  const calls: string[] = [];
  const tx = {
    calls,
    levels,
    product: { findUnique: jest.fn(() => Promise.resolve(PRODUCT)) },
    warehouse: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          code: where.id.toUpperCase(),
          isActive: where.id !== 'closed',
        }),
      ),
    },
    stockLevel: {
      upsert: jest.fn(
        ({ create }: { create: { productId: string; warehouseId: string; quantity: number } }) => {
          const k = key(create.productId, create.warehouseId);
          calls.push(`inc:${create.warehouseId}`);
          levels[k] = (levels[k] ?? 0) + create.quantity;
          return Promise.resolve({ quantity: levels[k] });
        },
      ),
      updateMany: jest.fn(
        ({
          where,
        }: {
          where: { productId: string; warehouseId: string; quantity: { gte: number } };
        }) => {
          const k = key(where.productId, where.warehouseId);
          calls.push(`dec:${where.warehouseId}`);
          if (levels[k] === undefined || levels[k] < where.quantity.gte) {
            return Promise.resolve({ count: 0 });
          }
          levels[k] -= where.quantity.gte;
          return Promise.resolve({ count: 1 });
        },
      ),
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { productId_warehouseId: { productId: string; warehouseId: string } };
        }) => {
          const { productId, warehouseId } = where.productId_warehouseId;
          const quantity = levels[key(productId, warehouseId)];
          return Promise.resolve(quantity === undefined ? null : { quantity });
        },
      ),
    },
    stockMovement: {
      create: jest.fn(({ data }: { data: object }) => Promise.resolve({ id: 'm1', ...data })),
    },
  };
  return tx;
}

describe('StockLedgerService', () => {
  const ledger = new StockLedgerService();
  const base = { productId: 'p1', createdById: 'u1' };

  it('IN creates/increments the level and reports the balance change', async () => {
    const tx = createTx({});
    const result = await ledger.record(tx as unknown as Tx, {
      ...base,
      type: 'IN',
      toWarehouseId: 'w1',
      quantity: 5,
    });
    expect(tx.levels['p1:w1']).toBe(5);
    expect(result.changes).toEqual([
      { productId: 'p1', warehouseId: 'w1', before: 0, after: 5, reorderLevel: 10 },
    ]);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
  });

  it('OUT never lets stock go negative and writes no ledger row', async () => {
    const tx = createTx({ 'p1:w1': 3 });
    const attempt = ledger.record(tx as unknown as Tx, {
      ...base,
      type: 'OUT',
      fromWarehouseId: 'w1',
      quantity: 4,
    });
    await expect(attempt).rejects.toBeInstanceOf(InsufficientStockException);
    await expect(attempt).rejects.toMatchObject({
      response: { details: { requested: 4, available: 3 } },
    });
    expect(tx.levels['p1:w1']).toBe(3);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('OUT from a warehouse that never held the product reports 0 available', async () => {
    const tx = createTx({});
    await expect(
      ledger.record(tx as unknown as Tx, {
        ...base,
        type: 'OUT',
        fromWarehouseId: 'w1',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ response: { details: { available: 0 } } });
  });

  it('OUT down to exactly zero is allowed', async () => {
    const tx = createTx({ 'p1:w1': 4 });
    const result = await ledger.record(tx as unknown as Tx, {
      ...base,
      type: 'OUT',
      fromWarehouseId: 'w1',
      quantity: 4,
    });
    expect(result.changes[0]).toMatchObject({ before: 4, after: 0 });
  });

  it('TRANSFER moves stock and locks rows in warehouse-id order', async () => {
    const tx = createTx({ 'p1:w9': 10 });
    const result = await ledger.record(tx as unknown as Tx, {
      ...base,
      type: 'TRANSFER',
      fromWarehouseId: 'w9',
      toWarehouseId: 'w1',
      quantity: 6,
    });
    expect(tx.levels).toEqual({ 'p1:w9': 4, 'p1:w1': 6 });
    expect(tx.calls).toEqual(['inc:w1', 'dec:w9']);
    expect(result.changes.map((c) => [c.warehouseId, c.before, c.after])).toEqual([
      ['w1', 0, 6],
      ['w9', 10, 4],
    ]);
  });

  it('rejects movements touching an inactive warehouse', async () => {
    const tx = createTx({});
    await expect(
      ledger.record(tx as unknown as Tx, {
        ...base,
        type: 'IN',
        toWarehouseId: 'closed',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects movements of unknown or inactive products', async () => {
    const tx = createTx({});
    tx.product.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      ledger.record(tx as unknown as Tx, { ...base, type: 'IN', toWarehouseId: 'w1', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.product.findUnique.mockResolvedValueOnce({ ...PRODUCT, isActive: false });
    await expect(
      ledger.record(tx as unknown as Tx, { ...base, type: 'IN', toWarehouseId: 'w1', quantity: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
