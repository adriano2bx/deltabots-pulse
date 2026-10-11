import { SignJWT, importPKCS8, importSPKI, jwtVerify, errors } from 'jose';
import { PulseError, ulid } from '@pulse/core';
import type { Env } from '../env';

const ALG = 'ES256';
const ISSUER = 'pulse';
const AUDIENCE = 'pulse-api';

let privCache: { pem: string; key: Promise<CryptoKey> } | null = null;
let pubCache: { pem: string; key: Promise<CryptoKey> } | null = null;

function privateKey(env: Env): Promise<CryptoKey> {
  if (!env.JWT_PRIVATE_KEY) throw new Error('JWT_PRIVATE_KEY ausente');
  if (!privCache || privCache.pem !== env.JWT_PRIVATE_KEY)
    privCache = { pem: env.JWT_PRIVATE_KEY, key: importPKCS8(env.JWT_PRIVATE_KEY, ALG) };
  return privCache.key;
}

function publicKey(env: Env): Promise<CryptoKey> {
  if (!env.JWT_PUBLIC_KEY) throw new Error('JWT_PUBLIC_KEY ausente');
  if (!pubCache || pubCache.pem !== env.JWT_PUBLIC_KEY)
    pubCache = { pem: env.JWT_PUBLIC_KEY, key: importSPKI(env.JWT_PUBLIC_KEY, ALG) };
  return pubCache.key;
}

export interface AccessClaims {
  sub: string;
  tid: string;
  sid: string;
  mfa: boolean;
}

export async function signAccessToken(
  env: Env,
  claims: AccessClaims,
): Promise<{ token: string; expiresIn: number }> {
  const ttl = Number(env.ACCESS_TOKEN_TTL_S || '900');
  const token = await new SignJWT({ tid: claims.tid, sid: claims.sid, mfa: claims.mfa })
    .setProtectedHeader({ alg: ALG, typ: 'at+jwt' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(ulid())
    .setExpirationTime(`${ttl}s`)
    .sign(await privateKey(env));
  return { token, expiresIn: ttl };
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, await publicKey(env), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALG],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.tid !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      throw new PulseError('AUTH_REQUIRED', 'token sem claims obrigatórias');
    }
    return { sub: payload.sub, tid: payload.tid, sid: payload.sid, mfa: payload.mfa === true };
  } catch (e) {
    if (e instanceof PulseError) throw e;
    if (e instanceof errors.JWTExpired) throw new PulseError('TOKEN_EXPIRED');
    throw new PulseError('AUTH_REQUIRED', 'token inválido');
  }
}
