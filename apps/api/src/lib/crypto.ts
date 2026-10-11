import { base64url, fromBase64url } from '@pulse/core';

const keyCache = new Map<string, Promise<CryptoKey>>();

function rawKey(secret: string): Uint8Array {
  const bytes = fromBase64url(secret);
  if (bytes.length !== 32) throw new Error('DATA_ENCRYPTION_KEY deve ter 32 bytes (base64url)');
  return bytes;
}

function aesKey(secret: string): Promise<CryptoKey> {
  const k = `aes:${secret}`;
  let p = keyCache.get(k);
  if (!p) {
    p = crypto.subtle.importKey('raw', rawKey(secret) as BufferSource, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    keyCache.set(k, p);
  }
  return p;
}

function hmacKey(secret: string | Uint8Array): Promise<CryptoKey> {
  const bytes = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
  return crypto.subtle.importKey('raw', bytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

/** AES-256-GCM com IV aleatório; formato `v1.<iv>.<ciphertext>` em base64url. */
export async function encrypt(secret: string, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(secret),
    new TextEncoder().encode(plaintext),
  );
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(ct))}`;
}

export async function decrypt(secret: string, payload: string): Promise<string> {
  const [v, iv, ct] = payload.split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('formato cifrado inválido');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64url(iv) as BufferSource },
    await aesKey(secret),
    fromBase64url(ct) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

export async function hmacHex(secret: string | Uint8Array, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Pseudônimo estável de e-mail para busca sem expor o endereço em tabelas auxiliares. */
export async function emailHash(secret: string, email: string): Promise<string> {
  return hmacHex(rawKey(secret), `email:${email.trim().toLowerCase()}`);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
