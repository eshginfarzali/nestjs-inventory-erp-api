import { crossedBelowReorderLevel, type StockChange } from './low-stock.rules';

const change = (before: number, after: number, reorderLevel: number): StockChange => ({
  productId: 'p',
  warehouseId: 'w',
  before,
  after,
  reorderLevel,
});

describe('crossedBelowReorderLevel', () => {
  it.each([
    [change(15, 9, 10), true],
    [change(10, 9, 10), true],
    [change(12, 0, 10), true],
    [change(15, 10, 10), false], // reaching the level is not below it
    [change(9, 5, 10), false], // already below: no repeated alert
    [change(5, 15, 10), false], // increase
    [change(5, 0, 0), false], // alerts disabled
  ])('%o -> %s', (input, expected) => {
    expect(crossedBelowReorderLevel(input)).toBe(expected);
  });
});
