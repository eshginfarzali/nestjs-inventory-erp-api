import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ProductionOrderStatus } from '../../generated/prisma/client';

export class ListProductionOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductionOrderStatus })
  @IsOptional()
  @IsEnum(ProductionOrderStatus)
  status?: ProductionOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;
}
