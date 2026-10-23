import { Injectable } from '@nestjs/common';
import { paginate, type Paginated } from '../common/dto/paginated.dto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListStockLevelsQueryDto } from './dto/list-movements-query.dto';
import type { StockLevelResponseDto } from './dto/stock-response.dto';

@Injectable()
export class StockLevelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListStockLevelsQueryDto): Promise<Paginated<StockLevelResponseDto>> {
    const where: Prisma.StockLevelWhereInput = {
      productId: query.productId,
      warehouseId: query.warehouseId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockLevel.findMany({
        where,
        include: {
          product: { select: { sku: true, name: true, unit: true, reorderLevel: true } },
          warehouse: { select: { code: true, name: true } },
        },
        orderBy: [{ product: { sku: 'asc' } }, { warehouse: { code: 'asc' } }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.stockLevel.count({ where }),
    ]);
    return paginate(data, total, query);
  }
}
