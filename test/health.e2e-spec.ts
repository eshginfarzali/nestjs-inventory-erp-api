import { createTestContext, type TestContext } from './support/test-app';

describe('Health & docs (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /health reports database and redis as up (no auth required)', async () => {
    const res = await ctx.http().get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('serves the OpenAPI document', async () => {
    const res = await ctx.http().get('/docs/openapi.json').expect(200);
    expect(res.body.info.title).toBe('Inventory & Production ERP API');
    expect(Object.keys(res.body.paths as object)).toEqual(
      expect.arrayContaining([
        '/auth/login',
        '/stock-movements/transfer',
        '/production-orders/{id}/complete',
      ]),
    );
  });

  it('propagates a caller-supplied request id', async () => {
    const res = await ctx.http().get('/health').set('x-request-id', 'trace-123').expect(200);
    expect(res.headers['x-request-id']).toBe('trace-123');
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await ctx.http().get('/does-not-exist').expect(404);
    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: '/does-not-exist',
    });
  });
});
