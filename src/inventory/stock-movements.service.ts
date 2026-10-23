import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate, type Paginated } from '../common/dto/paginated.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type { Prisma, StockMovement } from '../generated/prisma/client';
import { LowStockService } from '../notifications/low-stock.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import type {
  AdjustStockDto,
  IssueStockDto,
  ReceiveStockDto,
  TransferStockDto,
} from './dto/stock-movement.dto';
import { type MovementInput, StockLedgerService } from './stock-ledger.service';

@Injectable()
export class StockMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedgerService,
    private readonly lowStock: LowStockService,
  ) {}

  receive(dto: ReceiveStockDto, user: AuthUser): Promise<StockMovement> {
    return this.record({
      type: 'IN',
      productId: dto.productId,
      toWarehouseId: dto.warehouseId,
      quantity: dto.quantity,
      reason: dto.reason,
      reference: dto.reference,
      createdById: user.id,
    });
  }

  issue(dto: IssueStockDto, user: AuthUser): Promise<StockMovement> {
    return this.record({
      type: 'OUT',
      productId: dto.productId,
      fromWarehouseId: dto.warehouseId,
      quantity: dto.quantity,
      reason: dto.reason,
      reference: dto.reference,
      createdById: user.id,
    });
  }

  transfer(dto: TransferStockDto, user: AuthUser): Promise<StockMovement> {
    return this.record({
      type: 'TRANSFER',
      productId: dto.productId,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      quantity: dto.quantity,
      reason: dto.reason,
      reference: dto.reference,
      createdById: user.id,
    });
  }

  adjust(dto: AdjustStockDto, user: AuthUser): Promise<StockMovement> {
    return this.record({
      type: 'ADJUSTMENT',
      productId: dto.productId,
      ...(dto.delta > 0
        ? { toWarehouseId: dto.warehouseId }
        : { fromWarehouseId: dto.warehouseId }),
      quantity: Math.abs(dto.delta),
      reason: dto.reason,
      reference: dto.reference,
      createdById: user.id,
    });
  }

  async findAll(query: ListMovementsQueryDto): Promise<Paginated<StockMovement>> {
    const where: Prisma.StockMovementWhereInput = {
      productId: query.productId,
      type: query.type,
      productionOrderId: query.productionOrderId,
      ...(query.warehouseId
        ? { OR: [{ fromWarehouseId: query.warehouseId }, { toWarehouseId: query.warehouseId }] }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<StockMovement> {
    const movement = await this.prisma.stockMovement.findUnique({ where: { id } });
    if (!movement) {
      throw new NotFoundException(`Stock movement ${id} not found`);
    }
    return movement;
  }

  private async record(input: MovementInput): Promise<StockMovement> {
    const { movement, changes } = await this.prisma.$transaction((tx) =>
      this.ledger.record(tx, input),
    );
    // Only after commit: a rolled-back movement must never trigger an alert.
    await this.lowStock.enqueueForChanges(changes);
    return movement;
  }
}
