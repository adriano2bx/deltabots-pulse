import type { D1Migration } from '@cloudflare/vitest-plugin';
import type { Env as PulseBindings } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends PulseBindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
