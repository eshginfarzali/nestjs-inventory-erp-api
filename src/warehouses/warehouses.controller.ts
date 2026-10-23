import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
} from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import type { Paginated } from '../common/dto/paginated.dto';
import { SearchQueryDto } from '../common/dto/search-query.dto';
import { Role, type Warehouse } from '../generated/prisma/client';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';
import { WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({ type: ErrorResponseDto })
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a warehouse (admin, manager)' })
  @ApiCreatedResponse({ type: WarehouseResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Code already exists' })
  create(@Body() dto: CreateWarehouseDto): Promise<Warehouse> {
    return this.warehouses.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List warehouses (paginated, searchable)' })
  @ApiPaginatedResponse(WarehouseResponseDto)
  findAll(@Query() query: SearchQueryDto): Promise<Paginated<Warehouse>> {
    return this.warehouses.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: WarehouseResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Warehouse> {
    return this.warehouses.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a warehouse (admin, manager)' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ): Promise<Warehouse> {
    return this.warehouses.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate an empty warehouse (admin, soft delete)' })
  @ApiOkResponse({ type: WarehouseResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Warehouse still holds stock' })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Warehouse> {
    return this.warehouses.deactivate(id);
  }
}
