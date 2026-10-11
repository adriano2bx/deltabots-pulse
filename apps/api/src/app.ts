import { Hono } from 'hono';
import { ZodError } from 'zod';
import { PulseError, newId, redact, toProblem } from '@pulse/core';
import type { AppEnv } from './env';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { consentRoutes } from './routes/consents';
import { organizationRoutes } from './routes/organizations';
import { deviceRoutes } from './routes/devices';
import { gatewayRoutes } from './routes/gateways';
import { telemetryRoutes } from './routes/telemetry';
import openapiYaml from '@pulse/contracts/openapi.yaml';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('traceId', newId('trc'));
    await next();
    c.header('x-trace-id', c.get('traceId'));
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'no-referrer');
    c.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    c.header('cache-control', c.res.headers.get('cache-control') ?? 'no-store');
  });

  // CORS por allowlist explícita (docs/12); nunca '*' com credenciais.
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    const allowed = (c.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = origin !== undefined && allowed.includes(origin);
    if (c.req.method === 'OPTIONS') {
      if (!ok) return c.body(null, 403);
      return c.body(null, 204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers':
          'authorization,content-type,idempotency-key,x-pulse-timestamp,x-pulse-signature',
        'access-control-max-age': '600',
        vary: 'Origin',
      });
    }
    await next();
    if (ok) {
      c.header('access-control-allow-origin', origin);
      c.header('vary', 'Origin');
      c.header('access-control-expose-headers', 'x-trace-id');
    }
  });

  app.onError((err, c) => {
    const traceId = c.get('traceId') ?? newId('trc');
    let pe: PulseError;
    if (err instanceof PulseError) pe = err;
    else if (err instanceof ZodError) pe = new PulseError('VALIDATION_ERROR', 'Dados inválidos');
    else {
      console.error(
        JSON.stringify({ level: 'error', trace_id: traceId, msg: redact(String(err?.stack ?? err)) }),
      );
      pe = new PulseError('INTERNAL_ERROR', 'Erro interno inesperado');
    }
    const problem = toProblem(pe, traceId, new URL(c.req.url).pathname);
    return c.json(problem, pe.status as 400, { 'content-type': 'application/problem+json; charset=utf-8' });
  });

  app.notFound((c) => {
    const problem = toProblem(
      new PulseError('NOT_FOUND', 'rota inexistente'),
      c.get('traceId') ?? newId('trc'),
    );
    return c.json(problem, 404, { 'content-type': 'application/problem+json; charset=utf-8' });
  });

  const v1 = new Hono<AppEnv>();
  v1.get('/openapi.yaml', (c) =>
    c.body(openapiYaml, 200, {
      'content-type': 'application/yaml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    }),
  );
  v1.get('/status', (c) => c.json({ status: 'ok', env: c.env.APP_ENV, time: new Date().toISOString() }));
  v1.route('/auth', authRoutes);
  v1.route('/me', meRoutes);
  v1.route('/consents', consentRoutes);
  v1.route('/organizations', organizationRoutes);
  v1.route('/devices', deviceRoutes);
  v1.route('/gateways', gatewayRoutes);
  v1.route('/telemetry', telemetryRoutes);
  app.route('/v1', v1);
  return app;
}
