import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import type { Paginated } from '../common/dto/paginated.dto';
import { ListStockLevelsQueryDto } from './dto/list-movements-query.dto';
import { StockLevelResponseDto } from './dto/stock-response.dto';
import { StockLevelsService } from './stock-levels.service';

@ApiTags('stock-levels')
@ApiBearerAuth()
@Controller('stock-levels')
export class StockLevelsController {
  constructor(private readonly levels: StockLevelsService) {}

  @Get()
  @ApiOperation({ summary: 'Current stock per product per warehouse (paginated)' })
  @ApiPaginatedResponse(StockLevelResponseDto)
  findAll(@Query() query: ListStockLevelsQueryDto): Promise<Paginated<StockLevelResponseDto>> {
    return this.levels.findAll(query);
  }
}
