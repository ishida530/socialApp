import path from 'node:path';

process.loadEnvFile(path.resolve(process.cwd(), '.env'));
