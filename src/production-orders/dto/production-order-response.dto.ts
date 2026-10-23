import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductionOrderStatus } from '../../generated/prisma/client';

export class ProductionOrderComponentResponseDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() quantityPerUnit!: number;
  @ApiProperty() totalQuantity!: number;
}

export class ProductionOrderResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 1 }) number!: number;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid' }) warehouseId!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ enum: ProductionOrderStatus }) status!: ProductionOrderStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ format: 'uuid' }) createdById!: string;
  @ApiPropertyOptional({ type: Date, nullable: true }) startedAt!: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) completedAt!: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) cancelledAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [ProductionOrderComponentResponseDto] })
  components!: ProductionOrderComponentResponseDto[];
}
