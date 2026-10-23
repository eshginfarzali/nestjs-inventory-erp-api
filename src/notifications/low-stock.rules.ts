/** Before/after balance of one product in one warehouse produced by a stock movement. */
export interface StockChange {
  productId: string;
  warehouseId: string;
  before: number;
  after: number;
  reorderLevel: number;
}

/**
 * A notification is raised only when a change takes the level from at/above
 * the reorder level to below it, so repeated withdrawals from an already-low
 * level do not spam the queue. A reorder level of 0 disables alerts.
 */
export function crossedBelowReorderLevel(change: StockChange): boolean {
  return (
    change.reorderLevel > 0 &&
    change.before >= change.reorderLevel &&
    change.after < change.reorderLevel
  );
}
