import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('La URL debe ser HTTP(S) sin credenciales.');
  }
  return url.href;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const headless = env.FLEX_HEADLESS ?? 'false';
  if (!['true', 'false'].includes(headless)) throw new Error('FLEX_HEADLESS debe ser true o false.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  return {
    url: env.FLEX_URL ? validateUrl(env.FLEX_URL) : undefined,
    profileDir: resolve(root, env.FLEX_PROFILE_DIR || '.playwright/flex-profile'),
    headless: headless === 'true',
  };
}
export type Config = ReturnType<typeof loadConfig>;
