import { createApp } from './app';
import type { Env } from './env';
import { queue } from './queues';

const app = createApp();

export default {
  fetch: app.fetch,
  queue,
} satisfies ExportedHandler<Env>;
