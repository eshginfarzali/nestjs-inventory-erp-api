import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { type Product, Role } from '../generated/prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { BomItemResponseDto, ProductResponseDto } from './dto/product-response.dto';
import { SetBomDto } from './dto/set-bom.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({ type: ErrorResponseDto })
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a product (admin, manager)' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'SKU already exists' })
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.products.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List products (paginated, searchable)' })
  @ApiPaginatedResponse(ProductResponseDto)
  findAll(@Query() query: SearchQueryDto): Promise<Paginated<Product>> {
    return this.products.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a product (admin, manager)' })
  @ApiOkResponse({ type: ProductResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto): Promise<Product> {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate a product (admin, soft delete)' })
  @ApiOkResponse({ type: ProductResponseDto })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.products.deactivate(id);
  }

  @Get(':id/bom')
  @ApiOperation({ summary: 'Get the bill of materials of a product' })
  @ApiOkResponse({ type: [BomItemResponseDto] })
  getBom(@Param('id', ParseUUIDPipe) id: string): Promise<BomItemResponseDto[]> {
    return this.products.getBom(id);
  }

  @Put(':id/bom')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Replace the bill of materials (admin, manager)' })
  @ApiOkResponse({ type: [BomItemResponseDto] })
  setBom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBomDto,
  ): Promise<BomItemResponseDto[]> {
    return this.products.setBom(id, dto);
  }
}
