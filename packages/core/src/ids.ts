const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** ULID (48 bits de tempo + 80 bits aleatórios), ordenável lexicograficamente. */
export function ulid(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rnd = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[(rnd[i] as number) % 32];
  return time + rand;
}

export type IdPrefix =
  | 'usr'
  | 'ten'
  | 'mem'
  | 'ses'
  | 'gw'
  | 'dev'
  | 'cap'
  | 'bnd'
  | 'cns'
  | 'inv'
  | 'grt'
  | 'rd'
  | 'agg'
  | 'slp'
  | 'act'
  | 'alr'
  | 'ntf'
  | 'chk'
  | 'aut'
  | 'run'
  | 'eqp'
  | 'ctl'
  | 'cmd'
  | 'gts'
  | 'gmd'
  | 'gmp'
  | 'gss'
  | 'int'
  | 'whk'
  | 'key'
  | 'exp'
  | 'ins'
  | 'fbk'
  | 'sub'
  | 'use'
  | 'aud'
  | 'idm'
  | 'rep'
  | 'cnv'
  | 'trc'
  | 'evt';

export function newId(prefix: IdPrefix, now?: number): string {
  return `${prefix}_${ulid(now)}`;
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
