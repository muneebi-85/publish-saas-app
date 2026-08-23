/* Creates a Clerk test user via the Backend API and prints the id + password */
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
  if (m) env[m[1]] = m[2].trim();
}

const SECRET = env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error('NO_CLERK_SECRET');
  process.exit(1);
}

const email = 'qa.buffy.test@proton.me';
const password = 'BuffyTest123!';

fetch('https://api.clerk.com/v1/users', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SECRET}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email_address: [email],
    password,
    public_metadata: { source: 'buffy-qa' },
  }),
})
  .then(async (r) => {
    const body = await r.json();
    console.log('STATUS:', r.status);
    console.log('RESPONSE:', JSON.stringify(body).slice(0, 600));
    if (r.ok && body.id) {
      console.log('USER_CREATED:', body.id, body.email_addresses?.[0]?.email_address);
    }
  })
  .catch((e) => {
    console.error('ERR:', e.message);
    process.exit(1);
  });
