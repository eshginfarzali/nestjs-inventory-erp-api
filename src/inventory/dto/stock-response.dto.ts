import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '../../generated/prisma/client';

export class StockMovementResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: MovementType }) type!: MovementType;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  fromWarehouseId!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  toWarehouseId!: string | null;
  @ApiProperty({ description: 'Always positive; direction is given by from/to' })
  quantity!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  productionOrderId!: string | null;
  @ApiProperty({ format: 'uuid' }) createdById!: string;
  @ApiProperty() createdAt!: Date;
}

class StockLevelProductDto {
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() reorderLevel!: number;
}

class StockLevelWarehouseDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class StockLevelResponseDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid' }) warehouseId!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: StockLevelProductDto }) product!: StockLevelProductDto;
  @ApiProperty({ type: StockLevelWarehouseDto }) warehouse!: StockLevelWarehouseDto;
}
