import { mkdir } from 'node:fs/promises';
import { chromium, type BrowserContext } from 'playwright';
import { validateUrl, type Config } from './config.js';

export class BrowserSession {
  private context?: BrowserContext;
  private opening?: Promise<unknown>;
  constructor(private readonly config: Config) {}

  async open(url?: string) {
    const previous = this.opening;
    const operation = (async () => {
      if (previous) await previous.catch(() => undefined);
      return this.openInternal(url);
    })();
    this.opening = operation;
    try { return await operation; }
    finally { if (this.opening === operation) this.opening = undefined; }
  }

  private async openInternal(url?: string) {
    const target = url ? validateUrl(url) : this.config.url;
    const reused = Boolean(this.context);
    if (!this.context) {
      await mkdir(this.config.profileDir, { recursive: true, mode: 0o700 });
      const context = await chromium.launchPersistentContext(this.config.profileDir, {
        headless: this.config.headless,
      });
      this.context = context;
      context.on('close', () => { if (this.context === context) this.context = undefined; });
    }
    const page = this.context.pages()[0] ?? await this.context.newPage();
    if (target) await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    return { ...this.check(), reused };
  }

  check() {
    return {
      browserOpen: Boolean(this.context),
      pageCount: this.context?.pages().length ?? 0,
      authentication: 'unknown' as const,
      message: 'No se verificó la autenticación: faltan señales de FlexIDE inspeccionadas en una sesión real.',
    };
  }

  /** Páginas del contexto propio; no conecta con otros perfiles ni navegadores. */
  pages() {
    return this.context?.pages() ?? [];
  }

  async close() {
    if (this.opening) await this.opening.catch(() => undefined);
    await this.context?.close();
    this.context = undefined;
  }
}
