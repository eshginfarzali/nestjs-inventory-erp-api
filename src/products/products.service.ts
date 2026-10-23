import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate, type Paginated } from '../common/dto/paginated.dto';
import type { SearchQueryDto } from '../common/dto/search-query.dto';
import type { Prisma, Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/prisma.types';
import type { CreateProductDto } from './dto/create-product.dto';
import type { BomItemResponseDto } from './dto/product-response.dto';
import type { SetBomDto } from './dto/set-bom.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({ data: dto });
  }

  async findAll(query: SearchQueryDto): Promise<Paginated<Product>> {
    const where: Prisma.ProductWhereInput = {
      isActive: query.isActive,
      ...(query.q
        ? {
            OR: [
              { sku: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { sku: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  /** Soft delete: products are referenced by the immutable stock ledger. */
  async deactivate(id: string): Promise<Product> {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }

  async getBom(id: string): Promise<BomItemResponseDto[]> {
    await this.findOne(id);
    const items = await this.prisma.bomItem.findMany({
      where: { productId: id },
      include: { component: { select: { sku: true, name: true } } },
      orderBy: { component: { sku: 'asc' } },
    });
    return items.map((item) => ({
      componentId: item.componentId,
      sku: item.component.sku,
      name: item.component.name,
      quantity: item.quantity,
    }));
  }

  async setBom(id: string, dto: SetBomDto): Promise<BomItemResponseDto[]> {
    await this.findOne(id);
    const componentIds = dto.items.map((item) => item.componentId);

    if (new Set(componentIds).size !== componentIds.length) {
      throw new BadRequestException('Each component may appear only once in a BOM');
    }
    if (componentIds.includes(id)) {
      throw new BadRequestException('A product cannot be a component of itself');
    }

    await this.prisma.$transaction(async (tx) => {
      const components = await tx.product.findMany({
        where: { id: { in: componentIds }, isActive: true },
        select: { id: true },
      });
      if (components.length !== componentIds.length) {
        throw new BadRequestException('All components must be existing, active products');
      }
      await this.assertNoCycle(tx, id, componentIds);

      await tx.bomItem.deleteMany({ where: { productId: id } });
      await tx.bomItem.createMany({
        data: dto.items.map((item) => ({
          productId: id,
          componentId: item.componentId,
          quantity: item.quantity,
        })),
      });
    });

    return this.getBom(id);
  }

  /** Rejects a BOM whose components (transitively) contain the product itself. */
  private async assertNoCycle(tx: Tx, productId: string, componentIds: string[]): Promise<void> {
    const visited = new Set<string>();
    let frontier = componentIds;
    while (frontier.length > 0) {
      const children = await tx.bomItem.findMany({
        where: { productId: { in: frontier } },
        select: { componentId: true },
      });
      const next: string[] = [];
      for (const { componentId } of children) {
        if (componentId === productId) {
          throw new BadRequestException('BOM would create a cycle');
        }
        if (!visited.has(componentId)) {
          visited.add(componentId);
          next.push(componentId);
        }
      }
      frontier = next;
    }
  }
}
