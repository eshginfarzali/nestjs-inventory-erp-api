import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

const PING_TIMEOUT_MS = 1500;

/**
 * Real PING against the Redis instance BullMQ uses, over a small dedicated
 * connection that fails fast (no offline queue, no retries) so the health
 * endpoint never hangs while Redis is down.
 */
@Injectable()
export class RedisHealthIndicator implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(
    private readonly health: HealthIndicatorService,
    config: AppConfigService,
  ) {
    this.client = new Redis({
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      password: config.get('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: PING_TIMEOUT_MS,
      connectionName: 'inventory-erp:health',
    });
    // Errors surface through pingCheck; avoid unhandled 'error' events.
    this.client.on('error', () => undefined);
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis ping timed out')), PING_TIMEOUT_MS);
      });
      const reply = await Promise.race([this.ping(), timeout]);
      return reply === 'PONG' ? indicator.up() : indicator.down({ message: 'Unexpected reply' });
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      clearTimeout(timer);
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  private async ping(): Promise<string> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
    return this.client.ping();
  }
}
