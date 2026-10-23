import {
  auth,
  createProduct,
  createTestContext,
  createWarehouse,
  type RoleKey,
  type TestContext,
} from './support/test-app';

describe('RBAC (e2e)', () => {
  let ctx: TestContext;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    productId = await createProduct(ctx, 'RBAC-1');
    warehouseId = await createWarehouse(ctx, 'WH-RBAC');
  });

  afterAll(async () => {
    await ctx.close();
  });

  type Method = 'get' | 'post' | 'patch' | 'delete';
  interface Case {
    name: string;
    method: Method;
    path: () => string;
    /** Built lazily (ids exist only after beforeAll); `role` keeps unique fields unique. */
    body?: (role: RoleKey) => object;
    expected: Record<RoleKey, number>;
  }

  const suffix = Date.now().toString(36).toUpperCase();
  const cases: Case[] = [
    {
      name: 'list users',
      method: 'get',
      path: () => '/users',
      expected: { admin: 200, manager: 403, operator: 403 },
    },
    {
      name: 'create product',
      method: 'post',
      path: () => '/products',
      body: (role) => ({ sku: `SKU-${suffix}-${role}`.toUpperCase(), name: 'x' }),
      expected: { admin: 201, manager: 201, operator: 403 },
    },
    {
      name: 'list products',
      method: 'get',
      path: () => '/products',
      expected: { admin: 200, manager: 200, operator: 200 },
    },
    {
      name: 'update product',
      method: 'patch',
      path: () => `/products/${productId}`,
      body: () => ({ name: 'Renamed' }),
      expected: { admin: 200, manager: 200, operator: 403 },
    },
    {
      name: 'create warehouse',
      method: 'post',
      path: () => '/warehouses',
      body: (role) => ({ code: `W-${suffix}-${role}`.toUpperCase(), name: 'x' }),
      expected: { admin: 201, manager: 201, operator: 403 },
    },
    {
      name: 'stock adjustment',
      method: 'post',
      path: () => '/stock-movements/adjustment',
      body: () => ({ productId, warehouseId, delta: 5, reason: 'count' }),
      expected: { admin: 201, manager: 201, operator: 403 },
    },
    {
      name: 'receive stock',
      method: 'post',
      path: () => '/stock-movements/in',
      body: () => ({ productId, warehouseId, quantity: 1 }),
      expected: { admin: 201, manager: 201, operator: 201 },
    },
    {
      name: 'list notifications',
      method: 'get',
      path: () => '/notifications',
      expected: { admin: 200, manager: 200, operator: 403 },
    },
    {
      name: 'plan production order',
      method: 'post',
      path: () => '/production-orders',
      body: () => ({ productId, warehouseId, quantity: 1 }),
      // admin/manager pass RBAC and reach business validation (product has no BOM -> 422)
      expected: { admin: 422, manager: 422, operator: 403 },
    },
  ];

  describe.each(cases)('$name', ({ method, path, body, expected }) => {
    it.each(Object.entries(expected) as [RoleKey, number][])('%s -> %d', async (role, status) => {
      const res = await ctx.http()[method](path()).set(auth(ctx.tokens[role])).send(body?.(role));
      expect(res.status).toBe(status);
      if (status === 403) {
        expect(res.body).toMatchObject({ statusCode: 403, error: 'Forbidden' });
      }
    });
  });

  it('only admins can deactivate products (managers get 403)', async () => {
    await ctx.http().delete(`/products/${productId}`).set(auth(ctx.tokens.manager)).expect(403);
    const res = await ctx
      .http()
      .delete(`/products/${productId}`)
      .set(auth(ctx.tokens.admin))
      .expect(200);
    expect(res.body).toMatchObject({ isActive: false });
  });

  it('rejects requests without a token with 401, not 403', async () => {
    await ctx.http().get('/products').expect(401);
  });
});
