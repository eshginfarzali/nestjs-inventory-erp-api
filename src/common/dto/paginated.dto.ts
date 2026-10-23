import { ApiProperty } from '@nestjs/swagger';
import type { PaginationQueryDto } from './pagination-query.dto';

export class PaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function paginate<T>(data: T[], total: number, query: PaginationQueryDto): Paginated<T> {
  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
