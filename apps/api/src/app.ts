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
import { shareRoutes } from './routes/share';
import { alertRoutes, checkinRoutes, notificationRoutes } from './routes/notifications';
import { activitiesRoutes, healthRoutes, sleepRoutes } from './routes/health';
import { exportRoutes, reportRoutes } from './routes/reports';
import { automationRoutes } from './routes/automations';
import { apiKeyRoutes, integrationRoutes, mcpRoutes, webhookRoutes } from './routes/integrations';
import { aiRoutes, mcpServerRoutes } from './routes/ai';
import { adminRoutes, billingRoutes } from './routes/billing';
import { gestureRoutes } from './routes/gestures';
import { controlRoutes } from './routes/control';
import { realtimeRoutes } from './routes/realtime';
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
  v1.route('/share', shareRoutes);
  v1.route('/notifications', notificationRoutes);
  v1.route('/alerts', alertRoutes);
  v1.route('/checkins', checkinRoutes);
  v1.route('/health', healthRoutes);
  v1.route('/activities', activitiesRoutes);
  v1.route('/sleep', sleepRoutes);
  v1.route('/reports', reportRoutes);
  v1.route('/exports', exportRoutes);
  v1.route('/automations', automationRoutes);
  v1.route('/integrations', integrationRoutes);
  v1.route('/webhooks', webhookRoutes);
  v1.route('/api-keys', apiKeyRoutes);
  v1.route('/mcp', mcpRoutes);
  v1.route('/mcp-server', mcpServerRoutes);
  v1.route('/ai', aiRoutes);
  v1.route('/billing', billingRoutes);
  v1.route('/admin', adminRoutes);
  v1.route('/gestures', gestureRoutes);
  v1.route('/control', controlRoutes);
  v1.route('/realtime', realtimeRoutes);
  app.route('/v1', v1);
  return app;
}
