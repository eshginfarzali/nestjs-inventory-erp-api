import {
  auth,
  createProduct,
  createTestContext,
  createWarehouse,
  receive,
  stockOf,
  type TestContext,
} from './support/test-app';

interface OrderBody {
  id: string;
  status: string;
  components: { productId: string; totalQuantity: number }[];
}

describe('Production orders (e2e)', () => {
  let ctx: TestContext;
  let sheet: string;
  let bolt: string;
  let cabinet: string;
  let warehouse: string;

  const plan = async (quantity: number) => {
    const res = await ctx
      .http()
      .post('/production-orders')
      .set(auth(ctx.tokens.manager))
      .send({ productId: cabinet, warehouseId: warehouse, quantity })
      .expect(201);
    return res.body as OrderBody;
  };

  const act = (id: string, action: 'start' | 'complete' | 'cancel', role = ctx.tokens.operator) =>
    ctx.http().post(`/production-orders/${id}/${action}`).set(auth(role));

  beforeAll(async () => {
    ctx = await createTestContext();
    sheet = await createProduct(ctx, 'STEEL-SHEET');
    bolt = await createProduct(ctx, 'BOLT-M8');
    cabinet = await createProduct(ctx, 'CABINET');
    warehouse = await createWarehouse(ctx, 'WH-PLANT');

    await ctx
      .http()
      .put(`/products/${cabinet}/bom`)
      .set(auth(ctx.tokens.manager))
      .send({
        items: [
          { componentId: sheet, quantity: 3 },
          { componentId: bolt, quantity: 16 },
        ],
      })
      .expect(200);

    await receive(ctx, sheet, warehouse, 10);
    await receive(ctx, bolt, warehouse, 40);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('refuses to plan an order for a product without a BOM', async () => {
    const res = await ctx
      .http()
      .post('/production-orders')
      .set(auth(ctx.tokens.manager))
      .send({ productId: bolt, warehouseId: warehouse, quantity: 1 })
      .expect(422);
    expect(res.body.message).toMatch(/no bill of materials/);
  });

  it('PLANNED -> IN_PROGRESS -> COMPLETED consumes components and produces output', async () => {
    const order = await plan(2);
    expect(order.status).toBe('PLANNED');
    expect(order.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: sheet, totalQuantity: 6 }),
        expect.objectContaining({ productId: bolt, totalQuantity: 32 }),
      ]),
    );

    // cannot skip IN_PROGRESS
    const skipped = await act(order.id, 'complete').expect(409);
    expect(skipped.body).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });

    await act(order.id, 'start').expect(200);
    const completed = await act(order.id, 'complete').expect(200);
    expect(completed.body).toMatchObject({ status: 'COMPLETED' });
    expect(completed.body.completedAt).toEqual(expect.any(String));

    expect(await stockOf(ctx, sheet, warehouse)).toBe(4);
    expect(await stockOf(ctx, bolt, warehouse)).toBe(8);
    expect(await stockOf(ctx, cabinet, warehouse)).toBe(2);

    const ledger = await ctx
      .http()
      .get('/stock-movements')
      .query({ productionOrderId: order.id })
      .set(auth(ctx.tokens.operator))
      .expect(200);
    expect(ledger.body.meta.total).toBe(3);

    // terminal state
    await act(order.id, 'complete').expect(409);
    await act(order.id, 'cancel', ctx.tokens.manager).expect(409);
  });

  it('completion with insufficient components rolls back everything', async () => {
    const order = await plan(2); // needs 6 sheets + 32 bolts; only 4 + 8 left
    await act(order.id, 'start').expect(200);

    // Both components are short now (sheets 4/6, bolts 8/32); whichever row is locked
    // first (components are processed in product-id order) is reported.
    const res = await act(order.id, 'complete').expect(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    const { details } = res.body as { details: { productId: string; requested: number } };
    expect([sheet, bolt]).toContain(details.productId);
    expect(details.requested).toBe(details.productId === sheet ? 6 : 32);

    const reloaded = await ctx
      .http()
      .get(`/production-orders/${order.id}`)
      .set(auth(ctx.tokens.operator))
      .expect(200);
    expect(reloaded.body.status).toBe('IN_PROGRESS');
    expect(await stockOf(ctx, sheet, warehouse)).toBe(4);
    expect(await stockOf(ctx, bolt, warehouse)).toBe(8);
    expect(await stockOf(ctx, cabinet, warehouse)).toBe(2);
    expect(await ctx.prisma.stockMovement.count({ where: { productionOrderId: order.id } })).toBe(
      0,
    );

    // operators may not cancel; managers may
    await act(order.id, 'cancel').expect(403);
    const cancelled = await act(order.id, 'cancel', ctx.tokens.manager).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED' });
    await act(order.id, 'start').expect(409);
  });

  it('lists orders filtered by status', async () => {
    const res = await ctx
      .http()
      .get('/production-orders')
      .query({ status: 'COMPLETED' })
      .set(auth(ctx.tokens.operator))
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({ status: 'COMPLETED', number: expect.any(Number) });
  });

  it('rejects a BOM that would create a cycle', async () => {
    await ctx
      .http()
      .put(`/products/${sheet}/bom`)
      .set(auth(ctx.tokens.manager))
      .send({ items: [{ componentId: cabinet, quantity: 1 }] })
      .expect(400);
  });
});
