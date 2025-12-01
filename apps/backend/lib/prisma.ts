/**
 * Prisma Client Singleton
 *
 * CRITICAL: Prevents database connection pool exhaustion by ensuring
 * only ONE Prisma instance exists across the entire application.
 *
 * WHY THIS MATTERS:
 * - Without singleton: Each request creates new Prisma + connection pool
 * - 100 requests = 100 connection pools = database overwhelmed
 * - With singleton: 1 Prisma instance shared across all requests
 * - Connection pooling works as intended
 *
 * BENEFITS:
 * - Prevents "too many connections" database errors
 * - Reduces memory usage (1 pool vs N pools)
 * - Faster response times (no connection overhead)
 * - Production-ready for load balancers
 */

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Create connection pool with optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Max 20 connections in pool
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout if can't get connection in 2s
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('[Prisma Pool] Unexpected error on idle client', err);
});

pool.on('connect', () => {
  console.log('[Prisma Pool] New client connected');
});

pool.on('remove', () => {
  console.log('[Prisma Pool] Client removed from pool');
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Singleton pattern: Reuse same instance across hot reloads in development
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

// Store in global for hot module reloading in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown: Close connections cleanly
async function gracefulShutdown() {
  console.log('[Prisma] Graceful shutdown initiated...');

  try {
    await prisma.$disconnect();
    console.log('[Prisma] Client disconnected');

    await pool.end();
    console.log('[Prisma] Connection pool closed');

    process.exit(0);
  } catch (error) {
    console.error('[Prisma] Error during shutdown:', error);
    process.exit(1);
  }
}

// Listen for shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Log connection info on startup
console.log('[Prisma] Singleton initialized');
console.log(`[Prisma] Max connections: ${pool.options.max}`);
console.log(`[Prisma] Environment: ${process.env.NODE_ENV}`);
