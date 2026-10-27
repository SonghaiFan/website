import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const blogRoot = path.join(root, 'apps/blog');
export function vaultRoot() {
  const localEnv = path.join(root, '.env.local');
  if (fs.existsSync(localEnv)) process.loadEnvFile(localEnv);
  const vault = path.resolve(root, process.env.VAULT_ROOT || '../../Knowledge');
  for (const folder of ['Blog', 'assets']) {
    if (!fs.statSync(path.join(vault, folder), { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`VAULT_ROOT must point to a vault with Blog/ and assets/: ${vault}`);
    }
  }
  return vault;
}
