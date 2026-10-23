import { BadRequestException } from '@nestjs/common';
import { assertValidMovementShape, type MovementShape } from './movement-rules';

describe('assertValidMovementShape', () => {
  const ok: MovementShape[] = [
    { type: 'IN', toWarehouseId: 'a', quantity: 1 },
    { type: 'OUT', fromWarehouseId: 'a', quantity: 1 },
    { type: 'TRANSFER', fromWarehouseId: 'a', toWarehouseId: 'b', quantity: 1 },
    { type: 'ADJUSTMENT', toWarehouseId: 'a', quantity: 1 },
    { type: 'ADJUSTMENT', fromWarehouseId: 'a', quantity: 1 },
  ];
  it.each(ok)('accepts %o', (movement) => {
    expect(() => assertValidMovementShape(movement)).not.toThrow();
  });

  const bad: [string, MovementShape][] = [
    ['IN with a source', { type: 'IN', fromWarehouseId: 'a', toWarehouseId: 'b', quantity: 1 }],
    ['OUT without a source', { type: 'OUT', toWarehouseId: 'a', quantity: 1 }],
    [
      'TRANSFER to itself',
      { type: 'TRANSFER', fromWarehouseId: 'a', toWarehouseId: 'a', quantity: 1 },
    ],
    [
      'ADJUSTMENT with both sides',
      { type: 'ADJUSTMENT', fromWarehouseId: 'a', toWarehouseId: 'b', quantity: 1 },
    ],
    ['zero quantity', { type: 'IN', toWarehouseId: 'a', quantity: 0 }],
    ['negative quantity', { type: 'OUT', fromWarehouseId: 'a', quantity: -5 }],
    ['fractional quantity', { type: 'IN', toWarehouseId: 'a', quantity: 1.5 }],
  ];
  it.each(bad)('rejects %s', (_name, movement) => {
    expect(() => assertValidMovementShape(movement)).toThrow(BadRequestException);
  });

  it('explains a same-warehouse transfer', () => {
    expect(() =>
      assertValidMovementShape({
        type: 'TRANSFER',
        fromWarehouseId: 'a',
        toWarehouseId: 'a',
        quantity: 1,
      }),
    ).toThrow('Source and destination warehouses must differ');
  });
});
