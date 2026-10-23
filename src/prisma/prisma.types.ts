import type { Prisma } from '../generated/prisma/client';

/** Client handle usable both inside and outside an interactive transaction. */
export type Tx = Prisma.TransactionClient;
