import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { LOW_STOCK_JOB, LOW_STOCK_QUEUE } from '../src/notifications/low-stock.constants';
import {
  auth,
  createProduct,
  createTestContext,
  createWarehouse,
  receive,
  type TestContext,
  waitFor,
} from './support/test-app';

interface NotificationBody {
  id: string;
  productId: string;
  quantity: number;
  reorderLevel: number;
  message: string;
  readAt: string | null;
}

describe('Low-stock notifications via BullMQ (e2e)', () => {
  let ctx: TestContext;
  let queue: Queue;
  let productId: string;
  let warehouseId: string;

  const issue = (quantity: number) =>
    ctx
      .http()
      .post('/stock-movements/out')
      .set(auth(ctx.tokens.operator))
      .send({ productId, warehouseId, quantity })
      .expect(201);

  const listNotifications = async () => {
    const res = await ctx.http().get('/notifications').set(auth(ctx.tokens.manager)).expect(200);
    return res.body as { data: NotificationBody[]; meta: { total: number } };
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    queue = ctx.app.get<Queue>(getQueueToken(LOW_STOCK_QUEUE));
    await queue.obliterate({ force: true });

    productId = await createProduct(ctx, 'PAINT-GREY', 10);
    warehouseId = await createWarehouse(ctx, 'WH-LOW');
    await receive(ctx, productId, warehouseId, 15);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await ctx.close();
  });

  it('enqueues a job when stock drops below the reorder level and the worker records a notification', async () => {
    const addSpy = jest.spyOn(queue, 'add');

    await issue(6); // 15 -> 9, reorder level 10

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith(
      LOW_STOCK_JOB,
      expect.objectContaining({ productId, warehouseId, quantity: 9, reorderLevel: 10 }),
      expect.any(Object),
    );

    const notification = await waitFor(async () => {
      const { data } = await listNotifications();
      return data[0];
    });
    expect(notification).toMatchObject({ productId, quantity: 9, reorderLevel: 10, readAt: null });
    expect(notification.message).toContain('PAINT-GREY');
    expect(notification.message).toContain('WH-LOW');
  });

  it('does not re-alert while the level stays below the threshold', async () => {
    const addSpy = jest.spyOn(queue, 'add');
    await issue(2); // 9 -> 7
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('alerts again after the level was replenished and dropped again', async () => {
    await receive(ctx, productId, warehouseId, 10); // 7 -> 17
    const addSpy = jest.spyOn(queue, 'add');
    await issue(8); // 17 -> 9
    expect(addSpy).toHaveBeenCalledTimes(1);

    await waitFor(async () => {
      const { meta } = await listNotifications();
      return meta.total === 2 ? true : undefined;
    });
  });

  it('notifications can be marked as read', async () => {
    const { data } = await listNotifications();
    const res = await ctx
      .http()
      .patch(`/notifications/${data[0].id}/read`)
      .set(auth(ctx.tokens.manager))
      .expect(200);
    expect(res.body.readAt).toEqual(expect.any(String));

    const unread = await ctx
      .http()
      .get('/notifications')
      .query({ unread: true })
      .set(auth(ctx.tokens.manager))
      .expect(200);
    expect(unread.body.meta.total).toBe(1);
  });
});
