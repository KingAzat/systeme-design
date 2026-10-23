import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Requêtes SQL tracées uniquement en développement ; en production, erreurs seules.
    log: process.env.NODE_ENV === 'production' ? (['error'] as const) : (['query'] as const),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db