import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class BomItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  componentId!: string;

  @ApiProperty({ example: 4, description: 'Units of component per unit of product' })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;
}

export class SetBomDto {
  @ApiProperty({ type: [BomItemDto], description: 'Replaces the whole bill of materials' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BomItemDto)
  items!: BomItemDto[];
}
