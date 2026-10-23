export const LOW_STOCK_QUEUE = 'low-stock';
export const LOW_STOCK_JOB = 'low-stock-detected';

export interface LowStockJobData {
  productId: string;
  warehouseId: string;
  quantity: number;
  reorderLevel: number;
  detectedAt: string;
}
