import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateProductionOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Finished product to manufacture (must have a BOM)' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Warehouse that supplies the components and receives the output',
  })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ example: 10, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
