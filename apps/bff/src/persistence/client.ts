import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/** Lazy singleton so tests/routes share one connection pool per process. */
export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
