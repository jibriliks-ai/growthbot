// ============================================================
// Auto Traffic Engine — Authentication helpers
// ============================================================
// - Password hashing (scrypt, built-in)
// - JWT signing/verification (HMAC-SHA256, hand-rolled)
// - API key generation
// - Validators
// ============================================================
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_ENV_NOW';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set. Tokens will not persist across restarts.');
}

// ─── PASSWORDS ───
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = String(stored).split(':');
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, 64);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ─── JWT ───
function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

export function signToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + Math.floor(TOKEN_TTL_MS / 1000),
  };
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const encodedBody = base64url(Buffer.from(JSON.stringify(body)));
  const sig = base64url(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${encodedBody}`).digest()
  );
  return `${header}.${encodedBody}.${sig}`;
}

export function verifyToken(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const expected = base64url(
      crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest()
    );
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
    const payload = JSON.parse(fromBase64url(b).toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── API KEYS ───
export function generateApiKey(email) {
  const prefix =
    (String(email).split('@')[0] || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'user';
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// ─── VALIDATORS ───
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

export default {
  hashPassword, verifyPassword, signToken, verifyToken,
  generateApiKey, validateEmail, validatePassword,
};