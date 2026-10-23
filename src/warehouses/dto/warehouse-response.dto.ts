import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WarehouseResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'WH-MAIN' }) code!: string;
  @ApiProperty({ example: 'Main warehouse' }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
