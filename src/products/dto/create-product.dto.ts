import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'BOLT-M8', description: 'Upper-case letters, digits, "-" and "_"' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/, { message: 'sku must be 2-64 chars of A-Z, 0-9, - or _' })
  sku!: string;

  @ApiProperty({ example: 'Bolt M8x40' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'pcs', default: 'pcs' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({
    example: 50,
    default: 0,
    description: 'A low-stock notification is raised when a warehouse level drops below this',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  reorderLevel?: number;
}
