// Throwaway-database migration replay on Neon: create scratch DB, replay all
// migrations from empty, diff against the schema, drop the scratch DB.
import { prisma } from '../src/lib/db';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

async function main() {
  // 1. create scratch db (connect to the default db)
  await prisma.$executeRawUnsafe(`CREATE DATABASE qascratch_replay`);
  console.log('scratch db created');

  const base = process.env.DATABASE_URL!.replace(/\/neondb\?/, '/qascratch_replay?');
  fs.writeFileSync('scripts-qa/.scratch-url.tmp', base);

  try {
    // 2. replay all migrations from empty
    const out = execSync(
      `npx prisma migrate deploy --schema prisma/schema.prisma`,
      { env: { ...process.env, DATABASE_URL: base }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    console.log(out.split('\n').filter(l => l.includes('migration') || l.includes('applied')).join('\n').slice(0, 600));

    // 3. diff scratch DB against the schema
    try {
      const diff = execSync(
        `npx prisma migrate diff --from-url "${base}" --to-schema-datamodel prisma/schema.prisma`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      console.log('FRESH-REPLAY DIFF:', diff.trim().slice(0, 400) || '(empty)');
    } catch (e: any) {
      console.log('DIFF (exit ' + e.status + '):', String(e.stdout || '').slice(0, 400));
    }
  } finally {
    // 4. drop scratch db — must run on a different connection
    const { PrismaClient } = await import('@prisma/client');
    const kill = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      await kill.$executeRawUnsafe(`DROP DATABASE qascratch_replay WITH (FORCE)`);
      console.log('scratch db dropped');
    } catch (e) {
      console.log('drop failed:', (e as Error).message);
    }
    await kill.$disconnect();
    fs.unlinkSync('scripts-qa/.scratch-url.tmp');
  }
  await prisma.$disconnect();
}
main();
