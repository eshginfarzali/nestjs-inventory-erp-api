import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Shape of every error returned by the API (see AllExceptionsFilter). */
export class ErrorResponseDto {
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'Conflict' }) error!: string;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Insufficient stock',
  })
  message!: string | string[];
  @ApiPropertyOptional({
    description: 'Machine-readable error code',
    example: 'INSUFFICIENT_STOCK',
  })
  code?: string;
  @ApiPropertyOptional({ description: 'Extra structured context' })
  details?: Record<string, unknown>;
  @ApiProperty({ example: '/stock-movements/out' }) path!: string;
  @ApiProperty({ example: 'POST' }) method!: string;
  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' }) timestamp!: string;
  @ApiPropertyOptional({ example: '5f7d3a2e-...' }) requestId?: string;
}
