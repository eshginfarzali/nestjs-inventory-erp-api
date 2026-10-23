import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Notification } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LOW_STOCK_QUEUE, type LowStockJobData } from './low-stock.constants';

/** Consumer: persists an in-app notification and logs a warning (no external e-mail). */
@Processor(LOW_STOCK_QUEUE)
export class LowStockProcessor extends WorkerHost {
  private readonly logger = new Logger(LowStockProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<LowStockJobData>): Promise<Notification> {
    const { productId, warehouseId, quantity, reorderLevel } = job.data;
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findUniqueOrThrow({ where: { id: productId } }),
      this.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } }),
    ]);

    const message =
      `Low stock: ${product.sku} (${product.name}) in ${warehouse.code} is at ` +
      `${quantity} ${product.unit}, below reorder level ${reorderLevel}`;

    const notification = await this.prisma.notification.create({
      data: { type: 'LOW_STOCK', productId, warehouseId, quantity, reorderLevel, message },
    });
    this.logger.warn({ jobId: job.id, notificationId: notification.id }, message);
    return notification;
  }
}
