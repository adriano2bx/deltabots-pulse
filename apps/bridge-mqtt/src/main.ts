import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import mqtt from 'mqtt';
import { Bridge } from './bridge';
import { logger } from './log';
import { HttpPulseApi } from './pulse-api';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`variável ${name} obrigatória`);
  return v;
}

const mqttUrl = env('MQTT_URL');
if (!mqttUrl.startsWith('mqtts://') && process.env.APP_ENV === 'production')
  throw new Error('MQTT_URL deve usar TLS (mqtts://) em produção');
const certPath = process.env.MQTT_CLIENT_CERT_PATH;
const keyPath = process.env.MQTT_CLIENT_KEY_PATH;
const caPath = process.env.MQTT_CA_PATH;

const client = mqtt.connect(mqttUrl, {
  clientId: env('MQTT_BRIDGE_CLIENT_ID', `pulse-bridge-${process.pid}`),
  protocolVersion: Number(process.env.MQTT_PROTOCOL_VERSION ?? 5) as 4 | 5,
  clean: true,
  reconnectPeriod: 2_000,
  connectTimeout: 10_000,
  rejectUnauthorized: true,
  ...(certPath && keyPath ? { cert: readFileSync(certPath), key: readFileSync(keyPath) } : {}),
  ...(caPath ? { ca: readFileSync(caPath) } : {}),
  ...(process.env.MQTT_USERNAME
    ? {
        username: process.env.MQTT_USERNAME,
        password: readFileSync(env('MQTT_PASSWORD_PATH'), 'utf8').trim(),
      }
    : {}),
});

const api = new HttpPulseApi(
  env('PULSE_API_URL'),
  env('PULSE_BRIDGE_TOKEN_PATH', '/run/secrets/pulse_bridge_token'),
  env('PULSE_BRIDGE_STATE_PATH', '/var/lib/pulse-bridge/refresh_token'),
);
const bridge = new Bridge(api, client, logger);
bridge.start(Number(process.env.SYNC_INTERVAL_MS ?? 5000));

const port = Number(process.env.HEALTH_PORT ?? 8080);
createServer((req, res) => {
  if (req.url === '/healthz') {
    const ok = bridge.metrics.mqtt_connected === 1;
    res
      .writeHead(ok ? 200 : 503, { 'content-type': 'application/json' })
      .end(JSON.stringify({ mqtt: ok, sessions: bridge.links.size }));
  } else if (req.url === '/metrics') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(bridge.prometheus());
  } else res.writeHead(404).end();
}).listen(port, '0.0.0.0');

const stop = () => {
  logger.info('encerrando bridge');
  bridge.stop();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
logger.info('bridge iniciada', { port });
