import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'BOLT-M8' }) sku!: string;
  @ApiProperty({ example: 'Bolt M8x40' }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ example: 'pcs' }) unit!: string;
  @ApiProperty({ example: 50 }) reorderLevel!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class BomItemResponseDto {
  @ApiProperty({ format: 'uuid' }) componentId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Units of component per unit of product' }) quantity!: number;
}
