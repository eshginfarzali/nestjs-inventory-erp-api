import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../common/interfaces/jwt-payload.interface';
import { PasswordService } from '../common/security/password.service';
import { hashToken, tokenHashesMatch } from '../common/security/token-hash';
import { AppConfigService } from '../config/app-config.service';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TokenResponseDto } from './dto/token-response.dto';

/**
 * Access/refresh token flow:
 * - login issues a pair and starts a new token family (one per session);
 * - refresh rotates: the presented token is revoked and a new one issued in the same family;
 * - presenting an already-rotated token is treated as theft and revokes the whole family;
 * - logout revokes the family. Only SHA-256 hashes of refresh tokens are stored.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly passwords: PasswordService,
  ) {}

  async login(email: string, password: string): Promise<TokenResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const passwordValid = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.passwords.verifyAgainstDummy(password);

    if (!user || !passwordValid || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user, randomUUID());
  }

  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken, false);
    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });

    if (
      !stored ||
      stored.userId !== payload.sub ||
      !tokenHashesMatch(stored.tokenHash, refreshToken)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        'Refresh token reuse detected; session revoked',
      );
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user?.isActive) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('User is inactive');
    }

    // Claim the token atomically so two concurrent refreshes cannot both succeed.
    const nextTokenId = randomUUID();
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: nextTokenId },
    });
    if (claimed.count === 0) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    return this.issueTokens(user, stored.familyId, nextTokenId);
  }

  /** Revokes the session (token family) the refresh token belongs to. Idempotent. */
  async logout(currentUser: AuthUser, refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken, true);
    if (payload.sub !== currentUser.id) {
      throw new UnauthorizedException('Refresh token does not belong to the current user');
    }
    await this.revokeFamily(payload.fam);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async verifyRefreshToken(
    token: string,
    ignoreExpiration: boolean,
  ): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        ignoreExpiration,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh' || !payload.jti || !payload.fam) {
      throw new UnauthorizedException('Invalid token type');
    }
    return payload;
  }

  private async issueTokens(
    user: Pick<User, 'id' | 'email' | 'role'>,
    familyId: string,
    tokenId: string = randomUUID(),
  ): Promise<TokenResponseDto> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL');
    const refreshTtl = this.config.get('JWT_REFRESH_TTL');

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };
    const refreshPayload: Omit<RefreshTokenPayload, 'jti'> = {
      sub: user.id,
      fam: familyId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: accessTtl,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
        jwtid: tokenId,
      }),
    ]);

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: accessTtl };
  }
}
