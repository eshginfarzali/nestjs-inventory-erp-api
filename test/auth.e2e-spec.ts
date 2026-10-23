import { auth, createTestContext, login, PASSWORD, type TestContext } from './support/test-app';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('logs in and returns a token pair', async () => {
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'ADMIN@e2e.test', password: PASSWORD })
      .expect(200);

    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('rejects bad credentials with the standard error shape', async () => {
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'admin@e2e.test', password: 'wrong-password' })
      .expect(401);

    expect(res.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid credentials',
      path: '/auth/login',
      method: 'POST',
    });
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('requestId');
  });

  it('validates the request body', async () => {
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'not-an-email', password: PASSWORD, extra: true })
      .expect(400);

    expect(res.body.message).toEqual(
      expect.arrayContaining(['email must be an email', 'property extra should not exist']),
    );
  });

  it('protects routes by default and exposes the current user', async () => {
    await ctx.http().get('/auth/me').expect(401);

    const res = await ctx.http().get('/auth/me').set(auth(ctx.tokens.manager)).expect(200);
    expect(res.body).toMatchObject({ email: 'manager@e2e.test', role: 'MANAGER' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rotates refresh tokens and revokes the session when an old token is replayed', async () => {
    const first = await login(ctx.app, 'operator@e2e.test');

    const rotated = await ctx
      .http()
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    const second = rotated.body as Tokens;
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await ctx.http().get('/auth/me').set(auth(second.accessToken)).expect(200);

    // Replaying the rotated token is treated as theft ...
    await ctx.http().post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    // ... and the whole session (token family) is revoked.
    await ctx.http().post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);

    const stored = await ctx.prisma.refreshToken.findMany({
      where: { userId: ctx.userIds.operator },
    });
    expect(stored.length).toBeGreaterThanOrEqual(2);
    expect(stored.every((token) => token.tokenHash.length === 64)).toBe(true);
  });

  it('logout revokes the refresh token', async () => {
    const tokens = await login(ctx.app, 'manager@e2e.test');

    await ctx
      .http()
      .post('/auth/logout')
      .set(auth(tokens.accessToken))
      .send({ refreshToken: tokens.refreshToken })
      .expect(204);

    await ctx.http().post('/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
  });

  it('deactivating a user revokes their sessions and blocks login', async () => {
    const created = await ctx
      .http()
      .post('/users')
      .set(auth(ctx.tokens.admin))
      .send({ email: 'temp@e2e.test', fullName: 'Temp', password: 'Temp-Password-1' })
      .expect(201);
    const userId = (created.body as { id: string }).id;
    const tokens = await login(ctx.app, 'temp@e2e.test', 'Temp-Password-1');

    await ctx
      .http()
      .patch(`/users/${userId}`)
      .set(auth(ctx.tokens.admin))
      .send({ isActive: false })
      .expect(200);

    await ctx.http().post('/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
    await ctx
      .http()
      .post('/auth/login')
      .send({ email: 'temp@e2e.test', password: 'Temp-Password-1' })
      .expect(401);
  });

  it('rejects duplicate e-mails with 409', async () => {
    const res = await ctx
      .http()
      .post('/users')
      .set(auth(ctx.tokens.admin))
      .send({ email: 'admin@e2e.test', fullName: 'Dup', password: 'Dup-Password-1' })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'UNIQUE_CONSTRAINT' });
  });
});
