import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../interfaces/auth-user.interface';
import { RolesGuard } from './roles.guard';

function contextFor(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const operator: AuthUser = { id: 'u1', email: 'op@x.io', role: Role.OPERATOR };

  function withMetadata(meta: { roles?: Role[]; isPublic?: boolean }) {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) =>
        key === ROLES_KEY ? meta.roles : key === IS_PUBLIC_KEY ? meta.isPublic : undefined,
      );
  }

  afterEach(() => jest.restoreAllMocks());

  it('allows any authenticated user when no roles are required', () => {
    withMetadata({});
    expect(guard.canActivate(contextFor(operator))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    withMetadata({ roles: [Role.ADMIN, Role.OPERATOR] });
    expect(guard.canActivate(contextFor(operator))).toBe(true);
  });

  it('rejects a user whose role is not listed', () => {
    withMetadata({ roles: [Role.ADMIN, Role.MANAGER] });
    expect(() => guard.canActivate(contextFor(operator))).toThrow(ForbiddenException);
  });

  it('rejects when roles are required but no user is attached', () => {
    withMetadata({ roles: [Role.ADMIN] });
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('skips the check on public routes', () => {
    withMetadata({ roles: [Role.ADMIN], isPublic: true });
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });
});
