import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

function findWebRoot() {
  const cwd = process.cwd();

  const directWeb = join(cwd, 'public');
  if (existsSync(directWeb)) {
    return cwd;
  }

  const monorepoWeb = join(cwd, 'apps', 'web', 'public');
  if (existsSync(monorepoWeb)) {
    return join(cwd, 'apps', 'web');
  }

  return cwd;
}

export function ensureUploadsDirectory() {
  const webRoot = findWebRoot();
  const uploadDir = join(webRoot, 'public', 'uploads', 'videos');
  mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}
