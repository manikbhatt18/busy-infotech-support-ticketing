import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: Pool;
};

const connectionString = process.env.DATABASE_URL;

const pool = globalForPrisma.pool ?? new Pool({ connectionString, max: 5 }); // Limit max connections to 5 to prevent exhaustion during dev
const adapter = new PrismaPg(pool);
const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.pool = pool;
  globalForPrisma.prisma = prisma;
}

export default prisma;
