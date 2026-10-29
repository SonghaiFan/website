import fs from 'node:fs';
import { readPublishingConfig } from './publishing-config.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const blogRoot = path.join(root, 'apps/blog');
export function vaultRoot() {
  const localEnv = path.join(root, '.env.local');
  if (fs.existsSync(localEnv)) process.loadEnvFile(localEnv);
  const vault = path.resolve(root, process.env.VAULT_ROOT || '../../Knowledge');
  const publishing = readPublishingConfig(vault);
  for (const folder of [publishing.publicFolder, publishing.assetsFolder]) {
    if (!fs.statSync(path.join(vault, folder), { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`VAULT_ROOT must point to a vault with the configured public and attachment folders: ${vault}`);
    }
  }
  return vault;
}
