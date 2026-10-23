import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { Role } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD = 'E2e-Password-123';

export type RoleKey = 'admin' | 'manager' | 'operator';

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
  /** Access tokens per role. */
  tokens: Record<RoleKey, string>;
  userIds: Record<RoleKey, string>;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

const USERS: Record<RoleKey, { email: string; role: Role }> = {
  admin: { email: 'admin@e2e.test', role: Role.ADMIN },
  manager: { email: 'manager@e2e.test', role: Role.MANAGER },
  operator: { email: 'operator@e2e.test', role: Role.OPERATOR },
};

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notifications, production_order_components, production_orders,
       stock_movements, stock_levels, bom_items, products, warehouses, refresh_tokens, users
     RESTART IDENTITY CASCADE`,
  );
}

export async function login(
  app: INestApplication<App>,
  email: string,
  password = PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string };
}

/** Boots the full AppModule against the Testcontainers DB/Redis with a clean database. */
export async function createTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);

  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const tokens = {} as Record<RoleKey, string>;
  const userIds = {} as Record<RoleKey, string>;
  for (const [key, user] of Object.entries(USERS) as [RoleKey, (typeof USERS)[RoleKey]][]) {
    const created = await prisma.user.create({
      data: { email: user.email, fullName: key, role: user.role, passwordHash },
    });
    userIds[key] = created.id;
    tokens[key] = (await login(app, user.email)).accessToken;
  }

  return {
    app,
    prisma,
    tokens,
    userIds,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Creates catalogue data through the API (as admin) and returns ids. */
export async function createProduct(
  ctx: TestContext,
  sku: string,
  reorderLevel = 0,
): Promise<string> {
  const res = await ctx
    .http()
    .post('/products')
    .set(auth(ctx.tokens.admin))
    .send({ sku, name: `Product ${sku}`, reorderLevel })
    .expect(201);
  return (res.body as { id: string }).id;
}

export async function createWarehouse(ctx: TestContext, code: string): Promise<string> {
  const res = await ctx
    .http()
    .post('/warehouses')
    .set(auth(ctx.tokens.admin))
    .send({ code, name: `Warehouse ${code}` })
    .expect(201);
  return (res.body as { id: string }).id;
}

export async function receive(
  ctx: TestContext,
  productId: string,
  warehouseId: string,
  quantity: number,
): Promise<void> {
  await ctx
    .http()
    .post('/stock-movements/in')
    .set(auth(ctx.tokens.operator))
    .send({ productId, warehouseId, quantity })
    .expect(201);
}

export async function stockOf(
  ctx: TestContext,
  productId: string,
  warehouseId: string,
): Promise<number> {
  const level = await ctx.prisma.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  return level?.quantity ?? 0;
}

export async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  { timeoutMs = 10_000, intervalMs = 100 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
