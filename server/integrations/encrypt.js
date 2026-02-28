const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) return null;
  return crypto.scryptSync(key, 'salt', KEY_LEN);
}

function encrypt(text) {
  if (!text) return text;
  const key = getKey();
  if (!key) return text;
  try {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    let enc = cipher.update(String(text), 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + tag.toString('hex') + enc;
  } catch {
    return text;
  }
}

function decrypt(encrypted) {
  if (!encrypted || typeof encrypted !== 'string') return encrypted;
  const key = getKey();
  if (!key) return encrypted;
  try {
    const iv = Buffer.from(encrypted.slice(0, IV_LEN * 2), 'hex');
    const tag = Buffer.from(encrypted.slice(IV_LEN * 2, (IV_LEN + TAG_LEN) * 2), 'hex');
    const enc = encrypted.slice((IV_LEN + TAG_LEN) * 2);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return encrypted;
  }
}

module.exports = { encrypt, decrypt };
