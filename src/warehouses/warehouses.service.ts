import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate, type Paginated } from '../common/dto/paginated.dto';
import type { SearchQueryDto } from '../common/dto/search-query.dto';
import type { Prisma, Warehouse } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateWarehouseDto } from './dto/create-warehouse.dto';
import type { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateWarehouseDto): Promise<Warehouse> {
    return this.prisma.warehouse.create({ data: dto });
  }

  async findAll(query: SearchQueryDto): Promise<Paginated<Warehouse>> {
    const where: Prisma.WarehouseWhereInput = {
      isActive: query.isActive,
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.warehouse.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found`);
    }
    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    await this.findOne(id);
    if (dto.isActive === false) {
      await this.assertEmpty(id);
    }
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  /** Soft delete; only allowed for warehouses that hold no stock. */
  async deactivate(id: string): Promise<Warehouse> {
    await this.findOne(id);
    await this.assertEmpty(id);
    return this.prisma.warehouse.update({ where: { id }, data: { isActive: false } });
  }

  private async assertEmpty(id: string): Promise<void> {
    const { _sum } = await this.prisma.stockLevel.aggregate({
      where: { warehouseId: id },
      _sum: { quantity: true },
    });
    if ((_sum.quantity ?? 0) > 0) {
      throw new ConflictException('Warehouse still holds stock; transfer it out first');
    }
  }
}
