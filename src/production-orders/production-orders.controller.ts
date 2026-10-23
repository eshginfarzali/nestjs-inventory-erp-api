import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import type { Paginated } from '../common/dto/paginated.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { Role } from '../generated/prisma/client';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { ListProductionOrdersQueryDto } from './dto/list-production-orders-query.dto';
import { ProductionOrderResponseDto } from './dto/production-order-response.dto';
import {
  type ProductionOrderWithComponents,
  ProductionOrdersService,
} from './production-orders.service';

@ApiTags('production-orders')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({ type: ErrorResponseDto })
@Controller('production-orders')
export class ProductionOrdersController {
  constructor(private readonly orders: ProductionOrdersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Plan a production order from the product BOM (admin, manager)' })
  @ApiCreatedResponse({ type: ProductionOrderResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'Product has no BOM' })
  create(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductionOrderWithComponents> {
    return this.orders.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List production orders (paginated)' })
  @ApiPaginatedResponse(ProductionOrderResponseDto)
  findAll(
    @Query() query: ListProductionOrdersQueryDto,
  ): Promise<Paginated<ProductionOrderWithComponents>> {
    return this.orders.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductionOrderResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductionOrderWithComponents> {
    return this.orders.findOne(id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PLANNED -> IN_PROGRESS' })
  @ApiOkResponse({ type: ProductionOrderResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INVALID_STATUS_TRANSITION' })
  start(@Param('id', ParseUUIDPipe) id: string): Promise<ProductionOrderWithComponents> {
    return this.orders.start(id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'IN_PROGRESS -> COMPLETED: consumes components and receives output atomically',
  })
  @ApiOkResponse({ type: ProductionOrderResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'INVALID_STATUS_TRANSITION or INSUFFICIENT_STOCK',
  })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductionOrderWithComponents> {
    return this.orders.complete(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'PLANNED | IN_PROGRESS -> CANCELLED (admin, manager)' })
  @ApiOkResponse({ type: ProductionOrderResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'INVALID_STATUS_TRANSITION' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<ProductionOrderWithComponents> {
    return this.orders.cancel(id);
  }
}
