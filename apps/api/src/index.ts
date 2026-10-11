import { createApp } from './app';
import type { Env } from './env';
import { queue } from './queues';
import { scheduled } from './scheduled';

export { PulseSessionRoom } from '@pulse/realtime';

const app = createApp();

export default {
  fetch: app.fetch,
  queue,
  scheduled,
} satisfies ExportedHandler<Env>;
