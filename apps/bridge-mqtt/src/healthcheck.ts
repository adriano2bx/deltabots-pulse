import { get } from 'node:http';

get(`http://127.0.0.1:${process.env.HEALTH_PORT ?? 8080}/healthz`, (res) =>
  process.exit(res.statusCode === 200 ? 0 : 1),
).on('error', () => process.exit(1));
