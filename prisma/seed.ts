/**
 * Idempotent demo seed: three users (one per role), two warehouses, raw
 * materials, one finished product with a bill of materials and opening stock.
 * Run with `npm run db:seed` (uses SEED_USER_PASSWORD from the environment).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient, Role } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.SEED_USER_PASSWORD;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
if (!password || password.length < 10) {
  throw new Error('SEED_USER_PASSWORD is required (min. 10 characters)');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const users = [
  { email: 'admin@inventory.local', fullName: 'Ada Admin', role: Role.ADMIN },
  { email: 'manager@inventory.local', fullName: 'Max Manager', role: Role.MANAGER },
  { email: 'operator@inventory.local', fullName: 'Olga Operator', role: Role.OPERATOR },
];

const warehouses = [
  { code: 'WH-MAIN', name: 'Main warehouse', address: 'Baku, Industrial zone 4' },
  { code: 'WH-EAST', name: 'East distribution centre', address: 'Ganja, Logistics park 2' },
];

const products = [
  { sku: 'STEEL-SHEET-1MM', name: 'Steel sheet 1mm 1x2m', unit: 'pcs', reorderLevel: 20 },
  { sku: 'BOLT-M8', name: 'Bolt M8x40 zinc', unit: 'pcs', reorderLevel: 200 },
  { sku: 'PAINT-GREY-1L', name: 'Powder paint grey 1L', unit: 'l', reorderLevel: 10 },
  { sku: 'CABINET-STD', name: 'Standard steel cabinet', unit: 'pcs', reorderLevel: 5 },
];

/** Components per CABINET-STD. */
const cabinetBom: Record<string, number> = {
  'STEEL-SHEET-1MM': 3,
  'BOLT-M8': 16,
  'PAINT-GREY-1L': 1,
};

/** Opening stock in WH-MAIN. */
const openingStock: Record<string, number> = {
  'STEEL-SHEET-1MM': 120,
  'BOLT-M8': 1500,
  'PAINT-GREY-1L': 40,
};

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(password!, { type: argon2.argon2id });

  const seededUsers = await Promise.all(
    users.map((user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: { ...user, passwordHash },
      }),
    ),
  );
  const admin = seededUsers.find((user) => user.role === Role.ADMIN)!;

  const seededWarehouses = await Promise.all(
    warehouses.map((warehouse) =>
      prisma.warehouse.upsert({ where: { code: warehouse.code }, update: {}, create: warehouse }),
    ),
  );
  const main = seededWarehouses.find((warehouse) => warehouse.code === 'WH-MAIN')!;

  const productBySku = new Map(
    (
      await Promise.all(
        products.map((product) =>
          prisma.product.upsert({ where: { sku: product.sku }, update: {}, create: product }),
        ),
      )
    ).map((product) => [product.sku, product]),
  );

  const cabinet = productBySku.get('CABINET-STD')!;
  for (const [sku, quantity] of Object.entries(cabinetBom)) {
    const component = productBySku.get(sku)!;
    await prisma.bomItem.upsert({
      where: { productId_componentId: { productId: cabinet.id, componentId: component.id } },
      update: { quantity },
      create: { productId: cabinet.id, componentId: component.id, quantity },
    });
  }

  // Opening stock is booked through the ledger once, so levels and movements agree.
  if ((await prisma.stockMovement.count()) === 0) {
    await prisma.$transaction(async (tx) => {
      for (const [sku, quantity] of Object.entries(openingStock)) {
        const product = productBySku.get(sku)!;
        await tx.stockMovement.create({
          data: {
            type: 'IN',
            productId: product.id,
            toWarehouseId: main.id,
            quantity,
            reason: 'Opening balance',
            reference: 'SEED',
            createdById: admin.id,
          },
        });
        await tx.stockLevel.create({
          data: { productId: product.id, warehouseId: main.id, quantity },
        });
      }
    });
  }

  console.log(
    `Seed complete: ${seededUsers.length} users, ${seededWarehouses.length} warehouses, ` +
      `${productBySku.size} products`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
