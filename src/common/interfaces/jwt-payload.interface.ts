import type { Role } from '../../generated/prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  /** Token family (one per login session). */
  fam: string;
  /** Token id, primary key of the stored refresh token row. */
  jti: string;
  type: 'refresh';
}
