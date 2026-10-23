import type { Queue } from 'bullmq';
import { LOW_STOCK_JOB, type LowStockJobData } from './low-stock.constants';
import { LowStockService } from './low-stock.service';

describe('LowStockService', () => {
  const add = jest.fn();
  const service = new LowStockService({ add } as unknown as Queue<LowStockJobData>);

  beforeEach(() => add.mockReset().mockResolvedValue({ id: '1' }));

  it('enqueues only changes that crossed below the reorder level', async () => {
    const enqueued = await service.enqueueForChanges([
      { productId: 'p1', warehouseId: 'w1', before: 12, after: 8, reorderLevel: 10 },
      { productId: 'p2', warehouseId: 'w1', before: 50, after: 40, reorderLevel: 10 },
      { productId: 'p3', warehouseId: 'w1', before: 0, after: 5, reorderLevel: 10 },
    ]);

    expect(enqueued).toBe(1);
    expect(add).toHaveBeenCalledWith(
      LOW_STOCK_JOB,
      expect.objectContaining({
        productId: 'p1',
        warehouseId: 'w1',
        quantity: 8,
        reorderLevel: 10,
      }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('swallows queue errors: the stock movement has already been committed', async () => {
    add.mockRejectedValueOnce(new Error('redis down'));
    await expect(
      service.enqueueForChanges([
        { productId: 'p1', warehouseId: 'w1', before: 12, after: 8, reorderLevel: 10 },
      ]),
    ).resolves.toBe(0);
  });
});
