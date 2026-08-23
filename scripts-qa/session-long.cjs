/* Creates a session for the test user and prints a long-lived JWT for the __session cookie */
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
  const createRes = await fetch('https://api.clerk.com/v1/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: USER_ID }),
  });
  const session = await createRes.json();
  console.log('CREATE_SESSION_STATUS:', createRes.status);
  const sessionId = session.id;
  console.log('SESSION_ID:', sessionId);

  const tokenRes = await fetch(`https://api.clerk.com/v1/sessions/${sessionId}/tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expires_in_seconds: 3600 }),
  });
  const tokenBody = await tokenRes.json();
  console.log('TOKEN_STATUS:', tokenRes.status);
  if (tokenRes.ok && tokenBody.jwt) {
    fs.writeFileSync(path.join(__dirname, 'session-long.jwt'), tokenBody.jwt);
    console.log('JWT_SAVED length', tokenBody.jwt.length);
  } else {
    console.log('TOKEN_BODY:', JSON.stringify(tokenBody).slice(0, 500));
  }
}

main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
