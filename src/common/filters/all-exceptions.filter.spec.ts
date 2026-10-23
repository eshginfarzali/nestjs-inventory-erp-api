import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { InsufficientStockException } from '../exceptions/domain.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });
}

describe('AllExceptionsFilter.normalize', () => {
  const filter = new AllExceptionsFilter();

  it('keeps validation messages from HttpExceptions', () => {
    const result = filter.normalize(new BadRequestException(['name should not be empty']));
    expect(result).toMatchObject({ statusCode: 400, message: ['name should not be empty'] });
  });

  it('exposes code and details of domain exceptions', () => {
    const result = filter.normalize(
      new InsufficientStockException({
        productId: 'p',
        warehouseId: 'w',
        requested: 5,
        available: 2,
      }),
    );
    expect(result).toMatchObject({
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
      details: { requested: 5, available: 2 },
    });
  });

  it.each([
    ['P2002', 409, 'UNIQUE_CONSTRAINT'],
    ['P2003', 409, 'FOREIGN_KEY_CONSTRAINT'],
    ['P2025', 404, 'NOT_FOUND'],
  ])('maps Prisma %s to HTTP %d', (code, statusCode, errorCode) => {
    expect(filter.normalize(prismaError(code))).toMatchObject({ statusCode, code: errorCode });
  });

  it('hides internals of unknown errors behind a 500', () => {
    expect(filter.normalize(new Error('secret connection string'))).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('keeps structured bodies without a message as details (e.g. health checks)', () => {
    const body = { status: 'error', details: { redis: { status: 'down' } } };
    const result = filter.normalize(new ServiceUnavailableException(body));
    expect(result.statusCode).toBe(503);
    expect(result.details).toEqual(body);
  });

  it('uses the string body of simple HttpExceptions', () => {
    expect(filter.normalize(new NotFoundException('Product x not found'))).toMatchObject({
      statusCode: 404,
      message: 'Product x not found',
    });
  });
});
