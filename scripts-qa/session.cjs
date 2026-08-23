/* Creates a session for the test user and prints a JWT that can be set as the __session cookie */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"#]*)"?$/);
  if (m) env[m[1]] = m[2].trim();
}

const SECRET = env.CLERK_SECRET_KEY;
const USER_ID = 'user_3HaxtkxOv7Mea6LO3UcUTnyKPD0';

async function main() {
  // 1. Create a session for the user
  const createRes = await fetch('https://api.clerk.com/v1/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: USER_ID }),
  });
  const session = await createRes.json();
  console.log('CREATE_SESSION_STATUS:', createRes.status);
  if (!createRes.ok) {
    console.log('CREATE_SESSION_BODY:', JSON.stringify(session).slice(0, 500));
    process.exit(1);
  }
  const sessionId = session.id;
  console.log('SESSION_ID:', sessionId);

  // 2. Mint a token for that session
  const tokenRes = await fetch(
    `https://api.clerk.com/v1/sessions/${sessionId}/tokens`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  const tokenBody = await tokenRes.json();
  console.log('TOKEN_STATUS:', tokenRes.status);
  if (tokenRes.ok && tokenBody.jwt) {
    // Write the JWT to a file for the browser to set as cookie
    fs.writeFileSync(path.join(__dirname, 'session.jwt'), tokenBody.jwt);
    console.log('JWT_SAVED: yes, length', tokenBody.jwt.length);
    console.log('JWT_PREFIX:', tokenBody.jwt.slice(0, 40) + '...');
  } else {
    console.log('TOKEN_BODY:', JSON.stringify(tokenBody).slice(0, 500));
  }
}

main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
