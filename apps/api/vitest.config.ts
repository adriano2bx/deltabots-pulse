import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(join(__dirname, '../../infra/migrations'));
  // Chaves efêmeras geradas por execução — nenhuma chave de teste é versionada.
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            APP_ENV: 'test',
            CORS_ORIGINS: 'https://console.test',
            JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
            JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
            DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
            WEBHOOK_SIGNING_SECRET: randomBytes(32).toString('base64url'),
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
    },
  };
});
