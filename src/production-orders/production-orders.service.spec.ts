import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import {
  InsufficientStockException,
  InvalidStatusTransitionException,
} from '../common/exceptions/domain.exception';
import type { StockLedgerService } from '../inventory/stock-ledger.service';
import type { LowStockService } from '../notifications/low-stock.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductionOrdersService } from './production-orders.service';

const user = { id: 'u1', email: 'op@x.io', role: 'OPERATOR' as const };

function order(status: string) {
  return {
    id: 'o1',
    number: 7,
    productId: 'cabinet',
    warehouseId: 'w1',
    quantity: 2,
    status,
    components: [
      { productId: 'bolt', quantityPerUnit: 16, totalQuantity: 32 },
      { productId: 'sheet', quantityPerUnit: 3, totalQuantity: 6 },
    ],
  };
}

function setup(initialStatus: string) {
  const tx = {
    productionOrder: {
      findUnique: jest.fn().mockResolvedValue(order(initialStatus)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    product: { findUnique: jest.fn() },
    warehouse: { findUnique: jest.fn() },
    bomItem: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const ledger = {
    record: jest.fn((_tx: unknown, input: { productId: string }) =>
      Promise.resolve({
        movement: { id: `m-${input.productId}` },
        changes: [
          {
            productId: input.productId,
            warehouseId: 'w1',
            before: 100,
            after: 50,
            reorderLevel: 0,
          },
        ],
      }),
    ),
  };
  const lowStock = { enqueueForChanges: jest.fn().mockResolvedValue(0) };
  const service = new ProductionOrdersService(
    prisma as unknown as PrismaService,
    ledger as unknown as StockLedgerService,
    lowStock as unknown as LowStockService,
  );
  return { service, tx, ledger, lowStock };
}

describe('ProductionOrdersService', () => {
  describe('complete', () => {
    it('consumes every component (OUT) and receives the output (IN) in one transaction', async () => {
      const { service, tx, ledger, lowStock } = setup('IN_PROGRESS');

      await service.complete('o1', user);

      expect(tx.productionOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: 'IN_PROGRESS' },
        data: expect.objectContaining({ status: 'COMPLETED' }) as unknown,
      });
      const movements = ledger.record.mock.calls.map(([, input]) => input) as {
        type: string;
        productId: string;
        quantity: number;
        productionOrderId: string;
      }[];
      expect(movements.map((m) => [m.type, m.productId, m.quantity])).toEqual([
        ['OUT', 'bolt', 32],
        ['OUT', 'sheet', 6],
        ['IN', 'cabinet', 2],
      ]);
      expect(movements.every((m) => m.productionOrderId === 'o1')).toBe(true);
      expect(lowStock.enqueueForChanges).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ productId: 'bolt' })]),
      );
    });

    it('propagates insufficient stock (rolling back) and does not enqueue alerts', async () => {
      const { service, ledger, lowStock } = setup('IN_PROGRESS');
      ledger.record.mockRejectedValueOnce(
        new InsufficientStockException({
          productId: 'bolt',
          warehouseId: 'w1',
          requested: 32,
          available: 10,
        }),
      );

      await expect(service.complete('o1', user)).rejects.toBeInstanceOf(InsufficientStockException);
      expect(lowStock.enqueueForChanges).not.toHaveBeenCalled();
    });

    it('refuses to complete an order that was never started', async () => {
      const { service, ledger } = setup('PLANNED');
      await expect(service.complete('o1', user)).rejects.toBeInstanceOf(
        InvalidStatusTransitionException,
      );
      expect(ledger.record).not.toHaveBeenCalled();
    });

    it('detects a concurrent status change', async () => {
      const { service, tx, ledger } = setup('IN_PROGRESS');
      tx.productionOrder.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.complete('o1', user)).rejects.toBeInstanceOf(ConflictException);
      expect(ledger.record).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('requires the product to have a bill of materials', async () => {
      const { service, tx } = setup('PLANNED');
      tx.product.findUnique.mockResolvedValue({ id: 'cabinet', sku: 'CAB', isActive: true });
      tx.warehouse.findUnique.mockResolvedValue({ id: 'w1', isActive: true });
      tx.bomItem.findMany.mockResolvedValue([]);

      await expect(
        service.create({ productId: 'cabinet', warehouseId: 'w1', quantity: 1 }, user),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('snapshots the BOM scaled by the order quantity', async () => {
      const { service, tx } = setup('PLANNED');
      tx.product.findUnique.mockResolvedValue({ id: 'cabinet', sku: 'CAB', isActive: true });
      tx.warehouse.findUnique.mockResolvedValue({ id: 'w1', isActive: true });
      tx.bomItem.findMany.mockResolvedValue([{ componentId: 'bolt', quantity: 16 }]);

      await service.create({ productId: 'cabinet', warehouseId: 'w1', quantity: 5 }, user);

      expect(tx.productionOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            components: {
              create: [{ productId: 'bolt', quantityPerUnit: 16, totalQuantity: 80 }],
            },
          }) as unknown,
        }),
      );
    });
  });
});
