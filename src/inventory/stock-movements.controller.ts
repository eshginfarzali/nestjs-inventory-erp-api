import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import type { Paginated } from '../common/dto/paginated.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { Role, type StockMovement } from '../generated/prisma/client';
import { ListMovementsQueryDto } from './dto/list-movements-query.dto';
import {
  AdjustStockDto,
  IssueStockDto,
  ReceiveStockDto,
  TransferStockDto,
} from './dto/stock-movement.dto';
import { StockMovementResponseDto } from './dto/stock-response.dto';
import { StockMovementsService } from './stock-movements.service';

@ApiTags('stock-movements')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly movements: StockMovementsService) {}

  @Post('in')
  @ApiOperation({ summary: 'Receive goods into a warehouse (IN)' })
  @ApiCreatedResponse({ type: StockMovementResponseDto })
  receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: AuthUser): Promise<StockMovement> {
    return this.movements.receive(dto, user);
  }

  @Post('out')
  @ApiOperation({ summary: 'Issue goods from a warehouse (OUT)' })
  @ApiCreatedResponse({ type: StockMovementResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INSUFFICIENT_STOCK' })
  issue(@Body() dto: IssueStockDto, @CurrentUser() user: AuthUser): Promise<StockMovement> {
    return this.movements.issue(dto, user);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Move goods between two warehouses atomically (TRANSFER)' })
  @ApiCreatedResponse({ type: StockMovementResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INSUFFICIENT_STOCK' })
  transfer(@Body() dto: TransferStockDto, @CurrentUser() user: AuthUser): Promise<StockMovement> {
    return this.movements.transfer(dto, user);
  }

  @Post('adjustment')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Correct a stock level after a count (ADJUSTMENT; admin, manager)' })
  @ApiCreatedResponse({ type: StockMovementResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INSUFFICIENT_STOCK' })
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthUser): Promise<StockMovement> {
    return this.movements.adjust(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Stock ledger (paginated, newest first)' })
  @ApiPaginatedResponse(StockMovementResponseDto)
  findAll(@Query() query: ListMovementsQueryDto): Promise<Paginated<StockMovement>> {
    return this.movements.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: StockMovementResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<StockMovement> {
    return this.movements.findOne(id);
  }
}
