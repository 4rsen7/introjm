const crypto = require('crypto');

const EXPORT_TOKEN_TTL_MS = 5 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getExportTokenSecret() {
  const secret =
    process.env.EXPORT_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!secret) {
    throw new Error('Export token secret is not configured');
  }

  return secret;
}

function createExportToken(payload) {
  const body = {
    ...payload,
    exp: Date.now() + EXPORT_TOKEN_TTL_MS,
    v: 1,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', getExportTokenSecret()).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyExportToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw new Error('Invalid export token');
  }

  const [encodedPayload, providedSignature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', getExportTokenSecret()).update(encodedPayload).digest('base64url');

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid export token');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload?.exp || payload.exp < Date.now()) {
    throw new Error('Export token expired');
  }

  return payload;
}

module.exports = {
  createExportToken,
  verifyExportToken,
};
