import { InvalidStatusTransitionException } from '../common/exceptions/domain.exception';
import type { ProductionOrderStatus } from '../generated/prisma/client';

/**
 *   PLANNED ──start──▶ IN_PROGRESS ──complete──▶ COMPLETED
 *      │                    │
 *      └──────cancel────────┴──────────────────▶ CANCELLED
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<ProductionOrderStatus, readonly ProductionOrderStatus[]>
> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: ProductionOrderStatus, to: ProductionOrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ProductionOrderStatus, to: ProductionOrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStatusTransitionException(from, to);
  }
}
