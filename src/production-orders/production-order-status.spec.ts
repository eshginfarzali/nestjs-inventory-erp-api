import { InvalidStatusTransitionException } from '../common/exceptions/domain.exception';
import type { ProductionOrderStatus } from '../generated/prisma/client';
import { assertTransition, canTransition } from './production-order-status';

describe('production order status machine', () => {
  const allowed: [ProductionOrderStatus, ProductionOrderStatus][] = [
    ['PLANNED', 'IN_PROGRESS'],
    ['PLANNED', 'CANCELLED'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['IN_PROGRESS', 'CANCELLED'],
  ];
  const forbidden: [ProductionOrderStatus, ProductionOrderStatus][] = [
    ['PLANNED', 'COMPLETED'],
    ['IN_PROGRESS', 'PLANNED'],
    ['COMPLETED', 'CANCELLED'],
    ['COMPLETED', 'IN_PROGRESS'],
    ['CANCELLED', 'IN_PROGRESS'],
    ['CANCELLED', 'COMPLETED'],
  ];

  it.each(allowed)('%s -> %s is allowed', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each(forbidden)('%s -> %s is rejected', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidStatusTransitionException);
  });
});
