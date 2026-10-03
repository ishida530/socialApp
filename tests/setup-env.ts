import path from 'node:path';
import { installNetworkGuard } from '@/lib/server/test-network-guard';

// TASK-1.1.1: testy ładują .env.test (baza flowstate_test, osobna od dev), nigdy .env.
process.loadEnvFile(path.resolve(process.cwd(), '.env.test'));

// Platform-review gates (lib/server/platform-availability.ts, 2026-10-02): the suites exercise the
// full feature set by default; tests/api/platform-availability.test.ts flips these explicitly.
process.env.PLATFORMS_IN_REVIEW ??= '';
process.env.COMMENTS_FEATURE_ENABLED ??= '1';
// Free beta (lib/beta.ts) is on in production; the suites cover the paid-plan flows by default and
// tests/unit/free-beta.test.ts switches it on explicitly.
process.env.NEXT_PUBLIC_FREE_BETA ??= '0';

installNetworkGuard();
