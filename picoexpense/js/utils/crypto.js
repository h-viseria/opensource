/**
 * AES-GCM passphrase encryption for backups. Key never leaves this device except
 * as wrapped ciphertext in the downloaded file.
 */

const MAGIC = 'PXENC1';

/**
 * @param {string} passphrase
 * @param {Uint8Array} salt
 */
async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * @param {string} plaintext
 * @param {string} passphrase
 * @returns {Promise<string>} JSON envelope
 */
export async function encryptText(plaintext, passphrase) {
  if (!passphrase) throw new Error('Passphrase is required');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return JSON.stringify({
    magic: MAGIC,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 150000,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(cipher)),
  });
}

/**
 * @param {string} envelopeJson
 * @param {string} passphrase
 */
export async function decryptText(envelopeJson, passphrase) {
  let parsed;
  try {
    parsed = JSON.parse(envelopeJson);
  } catch {
    throw new Error('Not an encrypted backup');
  }
  if (parsed.magic !== MAGIC) throw new Error('Not an encrypted PicoExpense backup');
  if (!passphrase) throw new Error('Passphrase is required');
  const salt = fromB64(parsed.salt);
  const iv = fromB64(parsed.iv);
  const data = fromB64(parsed.ciphertext);
  const key = await deriveKey(passphrase, salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Wrong passphrase or corrupted file');
  }
}

/**
 * @param {string} text
 */
export function isEncryptedBackup(text) {
  try {
    const p = JSON.parse(text);
    return p && p.magic === MAGIC;
  } catch {
    return false;
  }
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(str) {
  const bin = atob(String(str || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
