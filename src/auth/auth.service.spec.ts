import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PasswordService } from '../common/security/password.service';
import { hashToken } from '../common/security/token-hash';
import type { AppConfigService } from '../config/app-config.service';
import type { EnvironmentVariables } from '../config/env.validation';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const env: Partial<EnvironmentVariables> = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 3600,
};

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@inventory.local',
  fullName: 'Admin',
  role: 'ADMIN' as const,
  isActive: true,
  passwordHash: 'hash',
};

interface StoredToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

function createPrismaMock() {
  const tokens = new Map<string, StoredToken>();
  const prisma = {
    tokens,
    user: {
      findUnique: jest.fn(({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(where.id === user.id || where.email === user.email ? user : null),
      ),
    },
    refreshToken: {
      create: jest.fn(({ data }: { data: Omit<StoredToken, 'revokedAt'> }) => {
        tokens.set(data.id, { ...data, revokedAt: null });
        return Promise.resolve(data);
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(tokens.get(where.id) ?? null),
      ),
      updateMany: jest.fn(
        ({ where }: { where: { id?: string; familyId?: string; revokedAt: null } }) => {
          let count = 0;
          for (const token of tokens.values()) {
            const matches =
              (where.id === undefined || token.id === where.id) &&
              (where.familyId === undefined || token.familyId === where.familyId) &&
              token.revokedAt === null;
            if (matches) {
              token.revokedAt = new Date();
              count += 1;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
  return prisma;
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let passwords: jest.Mocked<Pick<PasswordService, 'verify' | 'verifyAgainstDummy'>>;
  let jwt: JwtService;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
    passwords = {
      verify: jest.fn((_hash: string, plain: string) => Promise.resolve(plain === 'correct')),
      verifyAgainstDummy: jest.fn((_plain: string) => Promise.resolve(false as const)),
    };
    jwt = new JwtService();
    const config = {
      get: (key: keyof EnvironmentVariables) => env[key],
    } as unknown as AppConfigService;
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
      passwords as unknown as PasswordService,
    );
  });

  describe('login', () => {
    it('issues an access/refresh pair and stores only the refresh token hash', async () => {
      const tokens = await service.login(user.email, 'correct');

      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(900);
      const [stored] = [...prisma.tokens.values()];
      expect(stored.tokenHash).toBe(hashToken(tokens.refreshToken));
      expect(stored.tokenHash).not.toContain(tokens.refreshToken);

      const access = jwt.decode<{ sub: string; role: string; type: string }>(tokens.accessToken);
      expect(access).toMatchObject({ sub: user.id, role: 'ADMIN', type: 'access' });
    });

    it('rejects a wrong password', async () => {
      await expect(service.login(user.email, 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email without revealing it (dummy hash is verified)', async () => {
      await expect(service.login('nobody@x.io', 'correct')).rejects.toThrow('Invalid credentials');
      expect(passwords.verifyAgainstDummy).toHaveBeenCalled();
    });

    it('rejects an inactive user', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...user, isActive: false });
      await expect(service.login(user.email, 'correct')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates the token: old one revoked, new one in the same family', async () => {
      const first = await service.login(user.email, 'correct');
      const second = await service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      const [oldToken, newToken] = [...prisma.tokens.values()];
      expect(oldToken.revokedAt).toBeInstanceOf(Date);
      expect(newToken.revokedAt).toBeNull();
      expect(newToken.familyId).toBe(oldToken.familyId);
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const first = await service.login(user.email, 'correct');
      const second = await service.refresh(first.refreshToken);

      await expect(service.refresh(first.refreshToken)).rejects.toThrow(
        'Refresh token has been revoked',
      );
      // the legitimately rotated token is now unusable as well
      await expect(service.refresh(second.refreshToken)).rejects.toThrow(UnauthorizedException);
      expect([...prisma.tokens.values()].every((token) => token.revokedAt !== null)).toBe(true);
    });

    it('rejects an access token presented as a refresh token', async () => {
      const { accessToken } = await service.login(user.email, 'correct');
      await expect(service.refresh(accessToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token whose stored hash does not match', async () => {
      const { refreshToken } = await service.login(user.email, 'correct');
      const [stored] = [...prisma.tokens.values()];
      stored.tokenHash = hashToken('something else');
      await expect(service.refresh(refreshToken)).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('logout', () => {
    it('revokes the session so the refresh token can no longer be used', async () => {
      const { refreshToken } = await service.login(user.email, 'correct');
      await service.logout({ id: user.id, email: user.email, role: 'ADMIN' }, refreshToken);

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("refuses to revoke another user's session", async () => {
      const { refreshToken } = await service.login(user.email, 'correct');
      await expect(
        service.logout({ id: 'someone-else', email: 'x@y.io', role: 'OPERATOR' }, refreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
