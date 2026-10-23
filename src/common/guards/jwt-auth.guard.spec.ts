import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AppConfigService } from '../../config/app-config.service';
import type { AuthenticatedRequest } from '../interfaces/auth-user.interface';
import { JwtAuthGuard } from './jwt-auth.guard';

const ACCESS_SECRET = 'a'.repeat(32);
const REFRESH_SECRET = 'r'.repeat(32);

describe('JwtAuthGuard', () => {
  const jwt = new JwtService();
  const reflector = new Reflector();
  const config = { get: () => ACCESS_SECRET } as unknown as AppConfigService;
  const guard = new JwtAuthGuard(reflector, jwt, config);

  function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

  beforeEach(() => jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined));
  afterEach(() => jest.restoreAllMocks());

  it('lets public routes through without a token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects a request without a bearer token', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const token = await jwt.signAsync({ sub: 'u1', type: 'access' }, { secret: 'x'.repeat(32) });
    await expect(guard.canActivate(contextFor(bearer(token)))).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync(
      { sub: 'u1', type: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
      { secret: ACCESS_SECRET },
    );
    await expect(guard.canActivate(contextFor(bearer(token)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a refresh token used as an access token', async () => {
    const token = await jwt.signAsync(
      { sub: 'u1', type: 'refresh', fam: 'f1' },
      { secret: ACCESS_SECRET },
    );
    await expect(guard.canActivate(contextFor(bearer(token)))).rejects.toThrow(
      'Invalid token type',
    );
    // and, of course, a real refresh token (different secret) is rejected outright
    const refresh = await jwt.signAsync({ sub: 'u1', type: 'refresh' }, { secret: REFRESH_SECRET });
    await expect(guard.canActivate(contextFor(bearer(refresh)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches the user to the request for a valid access token', async () => {
    const token = await jwt.signAsync(
      { sub: 'u1', email: 'a@b.io', role: 'MANAGER', type: 'access' },
      { secret: ACCESS_SECRET, expiresIn: 60 },
    );
    const request: Partial<AuthenticatedRequest> = bearer(token);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'a@b.io', role: 'MANAGER' });
  });
});
