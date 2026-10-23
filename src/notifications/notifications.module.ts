import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LOW_STOCK_QUEUE } from './low-stock.constants';
import { LowStockProcessor } from './low-stock.processor';
import { LowStockService } from './low-stock.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BullModule.registerQueue({ name: LOW_STOCK_QUEUE })],
  controllers: [NotificationsController],
  providers: [LowStockService, LowStockProcessor, NotificationsService],
  exports: [LowStockService],
})
export class NotificationsModule {}
