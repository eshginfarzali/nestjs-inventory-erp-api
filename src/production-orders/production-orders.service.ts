import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { paginate, type Paginated } from '../common/dto/paginated.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { Prisma, ProductionOrderStatus } from '../generated/prisma/client';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import type { StockChange } from '../notifications/low-stock.rules';
import { LowStockService } from '../notifications/low-stock.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/prisma.types';
import type { CreateProductionOrderDto } from './dto/create-production-order.dto';
import type { ListProductionOrdersQueryDto } from './dto/list-production-orders-query.dto';
import { assertTransition } from './production-order-status';

const withComponents = {
  components: { orderBy: { productId: 'asc' } },
} satisfies Prisma.ProductionOrderInclude;

export type ProductionOrderWithComponents = Prisma.ProductionOrderGetPayload<{
  include: typeof withComponents;
}>;

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedgerService,
    private readonly lowStock: LowStockService,
  ) {}

  /** Creates a PLANNED order and snapshots the product's BOM onto it. */
  async create(
    dto: CreateProductionOrderDto,
    user: AuthUser,
  ): Promise<ProductionOrderWithComponents> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: dto.productId } });
      if (!product?.isActive) {
        throw new NotFoundException(`Active product ${dto.productId} not found`);
      }
      const warehouse = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!warehouse?.isActive) {
        throw new NotFoundException(`Active warehouse ${dto.warehouseId} not found`);
      }

      const bom = await tx.bomItem.findMany({ where: { productId: dto.productId } });
      if (bom.length === 0) {
        throw new UnprocessableEntityException(
          `Product ${product.sku} has no bill of materials; define it before planning production`,
        );
      }

      return tx.productionOrder.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          notes: dto.notes,
          createdById: user.id,
          components: {
            create: bom.map((item) => ({
              productId: item.componentId,
              quantityPerUnit: item.quantity,
              totalQuantity: item.quantity * dto.quantity,
            })),
          },
        },
        include: withComponents,
      });
    });
  }

  async findAll(
    query: ListProductionOrdersQueryDto,
  ): Promise<Paginated<ProductionOrderWithComponents>> {
    const where: Prisma.ProductionOrderWhereInput = {
      status: query.status,
      productId: query.productId,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.productionOrder.findMany({
        where,
        include: withComponents,
        orderBy: { number: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<ProductionOrderWithComponents> {
    return this.findOrThrow(this.prisma, id);
  }

  start(id: string): Promise<ProductionOrderWithComponents> {
    return this.transition(id, 'IN_PROGRESS', { startedAt: new Date() });
  }

  cancel(id: string): Promise<ProductionOrderWithComponents> {
    return this.transition(id, 'CANCELLED', { cancelledAt: new Date() });
  }

  /**
   * Completes an IN_PROGRESS order in ONE transaction: claims the status,
   * issues every component (OUT) and receives the finished goods (IN). If any
   * component is short, everything rolls back and the order stays IN_PROGRESS.
   */
  async complete(id: string, user: AuthUser): Promise<ProductionOrderWithComponents> {
    const { order, changes } = await this.prisma.$transaction(async (tx) => {
      const current = await this.findOrThrow(tx, id);
      assertTransition(current.status, 'COMPLETED');
      await this.claimStatus(tx, id, current.status, 'COMPLETED', { completedAt: new Date() });

      const reference = `MO-${current.number}`;
      const stockChanges: StockChange[] = [];
      // Components are already ordered by productId -> deterministic lock order.
      for (const component of current.components) {
        const result = await this.ledger.record(tx, {
          type: 'OUT',
          productId: component.productId,
          fromWarehouseId: current.warehouseId,
          quantity: component.totalQuantity,
          reason: `Consumed by production order #${current.number}`,
          reference,
          productionOrderId: id,
          createdById: user.id,
        });
        stockChanges.push(...result.changes);
      }

      const output = await this.ledger.record(tx, {
        type: 'IN',
        productId: current.productId,
        toWarehouseId: current.warehouseId,
        quantity: current.quantity,
        reason: `Produced by production order #${current.number}`,
        reference,
        productionOrderId: id,
        createdById: user.id,
      });
      stockChanges.push(...output.changes);

      return { order: await this.findOrThrow(tx, id), changes: stockChanges };
    });

    await this.lowStock.enqueueForChanges(changes);
    return order;
  }

  private async transition(
    id: string,
    to: ProductionOrderStatus,
    data: Prisma.ProductionOrderUpdateManyMutationInput,
  ): Promise<ProductionOrderWithComponents> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findOrThrow(tx, id);
      assertTransition(current.status, to);
      await this.claimStatus(tx, id, current.status, to, data);
      return this.findOrThrow(tx, id);
    });
  }

  /** Optimistic concurrency: only succeeds if nobody changed the status meanwhile. */
  private async claimStatus(
    tx: Tx,
    id: string,
    from: ProductionOrderStatus,
    to: ProductionOrderStatus,
    data: Prisma.ProductionOrderUpdateManyMutationInput,
  ): Promise<void> {
    const { count } = await tx.productionOrder.updateMany({
      where: { id, status: from },
      data: { ...data, status: to },
    });
    if (count === 0) {
      throw new ConflictException('Production order was modified concurrently; retry');
    }
  }

  private async findOrThrow(tx: Tx, id: string): Promise<ProductionOrderWithComponents> {
    const order = await tx.productionOrder.findUnique({ where: { id }, include: withComponents });
    if (!order) {
      throw new NotFoundException(`Production order ${id} not found`);
    }
    return order;
  }
}
