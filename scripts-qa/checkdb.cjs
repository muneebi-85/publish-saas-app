const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user
  .findMany({ take: 10, select: { email: true, plan: true, clerkId: true } })
  .then((u) => {
    console.log('USERS:', JSON.stringify(u));
    return p.$disconnect();
  })
  .catch((e) => {
    console.error('DB_ERR:', e.message);
    process.exit(1);
  });
