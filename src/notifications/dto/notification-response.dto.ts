import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../../generated/prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid' }) warehouseId!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() reorderLevel!: number;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ type: Date, nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
