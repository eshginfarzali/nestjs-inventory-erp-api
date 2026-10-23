import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LOW_STOCK_JOB, LOW_STOCK_QUEUE, type LowStockJobData } from './low-stock.constants';
import { crossedBelowReorderLevel, type StockChange } from './low-stock.rules';

/**
 * Producer side of the low-stock pipeline. Called *after* the stock
 * transaction has committed, so a job never references a rolled-back change.
 */
@Injectable()
export class LowStockService {
  private readonly logger = new Logger(LowStockService.name);

  constructor(@InjectQueue(LOW_STOCK_QUEUE) private readonly queue: Queue<LowStockJobData>) {}

  /** Enqueues a job for each change that crossed below its reorder level. Never throws. */
  async enqueueForChanges(changes: StockChange[]): Promise<number> {
    const crossed = changes.filter(crossedBelowReorderLevel);
    let enqueued = 0;
    for (const change of crossed) {
      try {
        await this.queue.add(
          LOW_STOCK_JOB,
          {
            productId: change.productId,
            warehouseId: change.warehouseId,
            quantity: change.after,
            reorderLevel: change.reorderLevel,
            detectedAt: new Date().toISOString(),
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
        enqueued += 1;
      } catch (error) {
        // The stock movement is already committed; alerting is best-effort.
        this.logger.error({ err: error, change }, 'Failed to enqueue low-stock job');
      }
    }
    return enqueued;
  }
}
