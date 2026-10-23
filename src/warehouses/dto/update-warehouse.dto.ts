import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateWarehouseDto } from './create-warehouse.dto';

export class UpdateWarehouseDto extends PartialType(
  OmitType(CreateWarehouseDto, ['code'] as const),
) {
  @ApiPropertyOptional({
    description: 'A warehouse can only be deactivated when it holds no stock',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
