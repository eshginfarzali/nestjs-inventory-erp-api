import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';

const MAX_QUANTITY = 1_000_000_000;

class MovementBaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ example: 'PO-2026-0042', description: 'External document reference' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class ReceiveStockDto extends MovementBaseDto {
  @ApiProperty({ format: 'uuid', description: 'Warehouse receiving the goods' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ example: 100, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Supplier delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class IssueStockDto extends ReceiveStockDto {}

export class TransferStockDto extends MovementBaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fromWarehouseId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toWarehouseId!: string;

  @ApiProperty({ example: 25, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdjustStockDto extends MovementBaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({
    example: -3,
    description: 'Signed correction (e.g. after a stock count). Cannot take stock below zero.',
  })
  @IsInt()
  @NotEquals(0)
  @Min(-MAX_QUANTITY)
  @Max(MAX_QUANTITY)
  delta!: number;

  @ApiProperty({ example: 'Cycle count difference' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
