import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'WH-MAIN', description: 'Upper-case letters, digits, "-" and "_"' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,31}$/, { message: 'code must be 2-32 chars of A-Z, 0-9, - or _' })
  code!: string;

  @ApiProperty({ example: 'Main warehouse' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Baku, Industrial zone 4' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}
