import path from 'node:path';
import { installNetworkGuard } from '@/lib/server/test-network-guard';

// TASK-1.1.1: testy ładują .env.test (baza flowstate_test, osobna od dev), nigdy .env.
process.loadEnvFile(path.resolve(process.cwd(), '.env.test'));

installNetworkGuard();
