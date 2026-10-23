import {
  auth,
  createProduct,
  createTestContext,
  createWarehouse,
  receive,
  stockOf,
  type TestContext,
} from './support/test-app';

describe('Stock movements (e2e)', () => {
  let ctx: TestContext;
  let productId: string;
  let main: string;
  let east: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    productId = await createProduct(ctx, 'BOLT-M8');
    main = await createWarehouse(ctx, 'WH-MAIN');
    east = await createWarehouse(ctx, 'WH-EAST');
    await receive(ctx, productId, main, 20);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('IN increases the stock level and records a ledger entry', async () => {
    expect(await stockOf(ctx, productId, main)).toBe(20);
    const movements = await ctx.prisma.stockMovement.findMany({ where: { productId } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: 'IN', toWarehouseId: main, quantity: 20 });
  });

  it('OUT can never take stock below zero', async () => {
    const res = await ctx
      .http()
      .post('/stock-movements/out')
      .set(auth(ctx.tokens.operator))
      .send({ productId, warehouseId: main, quantity: 21 })
      .expect(409);

    expect(res.body).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { requested: 21, available: 20 },
    });
    expect(await stockOf(ctx, productId, main)).toBe(20);
    expect(await ctx.prisma.stockMovement.count({ where: { type: 'OUT' } })).toBe(0);
  });

  it('OUT from a warehouse without any stock is rejected', async () => {
    await ctx
      .http()
      .post('/stock-movements/out')
      .set(auth(ctx.tokens.operator))
      .send({ productId, warehouseId: east, quantity: 1 })
      .expect(409);
  });

  it('TRANSFER moves stock between warehouses atomically', async () => {
    const res = await ctx
      .http()
      .post('/stock-movements/transfer')
      .set(auth(ctx.tokens.operator))
      .send({ productId, fromWarehouseId: main, toWarehouseId: east, quantity: 8 })
      .expect(201);

    expect(res.body).toMatchObject({
      type: 'TRANSFER',
      fromWarehouseId: main,
      toWarehouseId: east,
      quantity: 8,
    });
    expect(await stockOf(ctx, productId, main)).toBe(12);
    expect(await stockOf(ctx, productId, east)).toBe(8);
  });

  it('a TRANSFER exceeding the source stock changes nothing', async () => {
    await ctx
      .http()
      .post('/stock-movements/transfer')
      .set(auth(ctx.tokens.operator))
      .send({ productId, fromWarehouseId: east, toWarehouseId: main, quantity: 9 })
      .expect(409);

    expect(await stockOf(ctx, productId, main)).toBe(12);
    expect(await stockOf(ctx, productId, east)).toBe(8);
  });

  it('a TRANSFER into the same warehouse is a 400', async () => {
    const res = await ctx
      .http()
      .post('/stock-movements/transfer')
      .set(auth(ctx.tokens.operator))
      .send({ productId, fromWarehouseId: main, toWarehouseId: main, quantity: 1 })
      .expect(400);
    expect(res.body.message).toBe('Source and destination warehouses must differ');
  });

  it('ADJUSTMENT corrects stock in both directions but not below zero', async () => {
    await ctx
      .http()
      .post('/stock-movements/adjustment')
      .set(auth(ctx.tokens.manager))
      .send({ productId, warehouseId: east, delta: -9, reason: 'Cycle count' })
      .expect(409);

    const down = await ctx
      .http()
      .post('/stock-movements/adjustment')
      .set(auth(ctx.tokens.manager))
      .send({ productId, warehouseId: east, delta: -3, reason: 'Damaged' })
      .expect(201);
    expect(down.body).toMatchObject({ fromWarehouseId: east, toWarehouseId: null, quantity: 3 });

    await ctx
      .http()
      .post('/stock-movements/adjustment')
      .set(auth(ctx.tokens.manager))
      .send({ productId, warehouseId: east, delta: 1, reason: 'Found one' })
      .expect(201);

    expect(await stockOf(ctx, productId, east)).toBe(6);
  });

  it('concurrent withdrawals never oversell', async () => {
    const sku = await createProduct(ctx, 'CONCURRENT-1');
    await receive(ctx, sku, main, 10);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        ctx
          .http()
          .post('/stock-movements/out')
          .set(auth(ctx.tokens.operator))
          .send({ productId: sku, warehouseId: main, quantity: 3 }),
      ),
    );

    const statuses = results.map((res) => res.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(3);
    expect(statuses.filter((status) => status === 409)).toHaveLength(7);
    expect(await stockOf(ctx, sku, main)).toBe(1);
  });

  it('the database itself rejects a negative balance (CHECK constraint)', async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE stock_levels SET quantity = -1 WHERE product_id = '${productId}'::uuid`,
      ),
    ).rejects.toThrow(/stock_levels_quantity_non_negative/);
  });

  it('lists the ledger and stock levels with pagination', async () => {
    const ledger = await ctx
      .http()
      .get('/stock-movements')
      .query({ productId, limit: 2, page: 1 })
      .set(auth(ctx.tokens.operator))
      .expect(200);
    expect(ledger.body.data).toHaveLength(2);
    expect(ledger.body.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });

    const levels = await ctx
      .http()
      .get('/stock-levels')
      .query({ warehouseId: east })
      .set(auth(ctx.tokens.operator))
      .expect(200);
    expect(levels.body.data).toEqual([
      expect.objectContaining({
        productId,
        quantity: 6,
        product: expect.objectContaining({ sku: 'BOLT-M8' }) as unknown,
        warehouse: expect.objectContaining({ code: 'WH-EAST' }) as unknown,
      }),
    ]);
  });

  it('rejects page sizes above the maximum', async () => {
    await ctx
      .http()
      .get('/stock-movements')
      .query({ limit: 1000 })
      .set(auth(ctx.tokens.operator))
      .expect(400);
  });

  it('cannot deactivate a warehouse that still holds stock', async () => {
    await ctx.http().delete(`/warehouses/${east}`).set(auth(ctx.tokens.admin)).expect(409);
  });
});
