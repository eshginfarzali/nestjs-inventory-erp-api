import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or every route of a controller) to the given roles.
 * Method-level metadata overrides controller-level metadata.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
