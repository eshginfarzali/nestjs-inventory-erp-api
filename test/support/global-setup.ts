import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Starts throw-away PostgreSQL and Redis containers (Testcontainers), applies
 * the committed Prisma migrations and exposes the connection settings to the
 * test process through environment variables.
 */
export default async function globalSetup(): Promise<void> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('inventory_erp_test')
      .withUsername('erp')
      .withPassword('erp')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SWAGGER_ENABLED: 'true',
    DATABASE_URL: postgres.getConnectionUri(),
    REDIS_HOST: redis.getHost(),
    REDIS_PORT: String(redis.getMappedPort(6379)),
    REDIS_PASSWORD: '',
    JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789-abcdefghijkl',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789-abcdefghijk',
    JWT_ACCESS_TTL: '900',
    JWT_REFRESH_TTL: '3600',
  });

  execFileSync(join(__dirname, '../../node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });

  globalThis.__E2E_CONTAINERS__ = [postgres, redis];
}
