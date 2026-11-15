import assert from 'assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import db from '../db/connection.js';

const PORT = 5098;
let server: http.Server;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function request(path: string, options: {
  method?: string;
  token?: string;
  body?: any;
} = {}) {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data };
}

async function runDynamicAuthTests() {
  console.log('=== BRAND SENTINEL DYNAMIC AUTHENTICATION TEST SUITE ===\n');

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Auth Test Server] Live on ${BASE_URL}`);
      resolve();
    });
  });

  try {
    const timestamp = Date.now();
    const testEmail = `newcreator_${timestamp}@enterprise.test`;
    const testPassword = 'SecurePassword2026!';
    const testFullName = 'Alexander Pierce';

    // 1. Successful Dynamic Registration
    console.log('1. Testing Successful Dynamic Registration...');
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: testFullName,
        email: testEmail,
        password: testPassword,
        role: 'CONTENT_CREATOR'
      }
    });
    assert.strictEqual(regRes.status, 201, 'Registration must return HTTP 201');
    assert.ok(regRes.data.token, 'Registration must return JWT token');
    assert.strictEqual(regRes.data.user.email, testEmail.toLowerCase());
    assert.strictEqual(regRes.data.user.role, 'CONTENT_CREATOR', 'Registered user must have CONTENT_CREATOR role');
    console.log(`✓ Registered new user: ${regRes.data.user.fullName} (${regRes.data.user.email})`);

    // 2. Duplicate Email Rejection
    console.log('\n2. Testing Duplicate Email Rejection...');
    const dupRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Another Name',
        email: testEmail, // same email
        password: 'AnotherPassword123'
      }
    });
    assert.strictEqual(dupRes.status, 409, 'Duplicate email registration must return HTTP 409');
    console.log('✓ Duplicate registration rejected with HTTP 409');

    // 3. Invalid Email Rejection
    console.log('\n3. Testing Invalid Email Format Rejection...');
    const invalidEmailRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Test User',
        email: 'not-an-email-address',
        password: 'Password123!'
      }
    });
    assert.strictEqual(invalidEmailRes.status, 400, 'Malformed email must return HTTP 400');
    console.log('✓ Malformed email rejected with HTTP 400');

    // 4. Password Policy & Hashing Verification
    console.log('\n4. Testing Password Hashing & Plaintext Immunity...');
    // Verify weak password rejected
    const weakPassRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Test User',
        email: `weak_${timestamp}@enterprise.test`,
        password: 'short' // less than 8 chars, no numbers
      }
    });
    assert.strictEqual(weakPassRes.status, 400, 'Weak password must return HTTP 400');
    console.log('✓ Weak password rejected with HTTP 400');

    // Inspect database record directly to ensure password is NEVER stored plaintext
    const dbUser = db.prepare(`SELECT * FROM users WHERE email = ?`).get(testEmail.toLowerCase()) as any;
    assert.ok(dbUser, 'User must exist in SQLite database');
    assert.notStrictEqual(dbUser.password_hash, testPassword, 'Plaintext password must NEVER be stored');
    assert.ok(dbUser.password_hash.startsWith('$2'), 'Password hash must be a bcrypt hash (starting with $2)');
    assert.ok(bcrypt.compareSync(testPassword, dbUser.password_hash), 'Bcrypt compare must validate the hashed password');
    console.log(`✓ Password hashing verified: stored hash starts with "${dbUser.password_hash.slice(0, 10)}..." (NOT plaintext)`);

    // 5. Successful Dynamic Login
    console.log('\n5. Testing Successful Dynamic Login...');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: testPassword
      }
    });
    assert.strictEqual(loginRes.status, 200, 'Login must return HTTP 200');
    assert.ok(loginRes.data.token, 'Login must issue valid JWT');
    assert.strictEqual(loginRes.data.user.email, testEmail.toLowerCase());
    const newCreatorToken = loginRes.data.token;
    console.log(`✓ Logged in dynamically: token issued for ${loginRes.data.user.fullName}`);

    // 6. Invalid Password Rejection
    console.log('\n6. Testing Invalid Password Rejection...');
    const badPassRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: testEmail,
        password: 'WrongPassword999!'
      }
    });
    assert.strictEqual(badPassRes.status, 401, 'Bad password must return HTTP 401');
    console.log('✓ Incorrect password rejected with HTTP 401');

    // 7. Unauthorized Role Assignment Rejection
    console.log('\n7. Testing Unauthorized Role Assignment Rejection in Public Registration...');
    const adminRegRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Attacker Admin',
        email: `hacker_${timestamp}@evil.test`,
        password: 'HackerPassword123!',
        role: 'BRAND_ADMIN' // Attempt to elevate to Admin
      }
    });
    assert.strictEqual(adminRegRes.status, 403, 'Attempt to register as BRAND_ADMIN must return HTTP 403 Forbidden');
    console.log('✓ Public registration escalation to BRAND_ADMIN blocked with HTTP 403');

    const reviewerRegRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Attacker Reviewer',
        email: `reviewer_hack_${timestamp}@evil.test`,
        password: 'HackerPassword123!',
        role: 'HUMAN_REVIEWER' // Attempt to elevate to Reviewer
      }
    });
    assert.strictEqual(reviewerRegRes.status, 403, 'Attempt to register as HUMAN_REVIEWER must return HTTP 403 Forbidden');
    console.log('✓ Public registration escalation to HUMAN_REVIEWER blocked with HTTP 403');

    // 8. Admin Provisioning & Route Protection
    console.log('\n8. Testing Admin Provisioning & Route Protection...');
    // 8.1 Creator blocked from calling admin user provisioning
    const creatorBlocked = await request('/api/auth/admin/users', {
      method: 'POST',
      token: newCreatorToken,
      body: {
        fullName: 'Privileged User',
        email: `priv_${timestamp}@enterprise.test`,
        password: 'Password123!',
        role: 'HUMAN_REVIEWER'
      }
    });
    assert.strictEqual(creatorBlocked.status, 403, 'Creator must be blocked from admin user provisioning (HTTP 403)');
    console.log('✓ Creator blocked from provisioning users (HTTP 403)');

    // 8.2 Login as existing authorized Brand Admin
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@vajra.com', password: 'password123' }
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    // 8.3 Authorized Brand Admin provisions a new Human Reviewer
    const newReviewerEmail = `prov_reviewer_${timestamp}@vajra.com`;
    const newReviewerPassword = 'ReviewerPass2026!';
    const provisionRes = await request('/api/auth/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Elena Assistant Reviewer',
        email: newReviewerEmail,
        password: newReviewerPassword,
        role: 'HUMAN_REVIEWER'
      }
    });
    assert.strictEqual(provisionRes.status, 201, 'Admin provisioning must return HTTP 201');
    assert.strictEqual(provisionRes.data.user.role, 'HUMAN_REVIEWER');
    console.log(`✓ Admin successfully provisioned new Reviewer: ${newReviewerEmail}`);

    // 8.4 Provisioned Reviewer can immediately log in dynamically
    const newReviewerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: newReviewerEmail,
        password: newReviewerPassword
      }
    });
    assert.strictEqual(newReviewerLogin.status, 200, 'Provisioned reviewer must be able to log in');
    assert.strictEqual(newReviewerLogin.data.user.role, 'HUMAN_REVIEWER');
    console.log(`✓ Provisioned Reviewer successfully authenticated with dynamic credentials`);

    console.log('\n======================================================');
    console.log(' ALL 8 DYNAMIC AUTH & RBAC SECURITY CHECKS PASSED!   ');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runDynamicAuthTests().catch((err) => {
  console.error('Dynamic auth test failed:', err);
  if (server) server.close();
  process.exit(1);
});

