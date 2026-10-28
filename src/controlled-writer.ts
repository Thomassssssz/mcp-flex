import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Locator } from 'playwright';
import { ModuleReader, MODULE_UI, filePath } from './module-reader.js';
import { ReadError, one, mismatch } from './flex-reader.js';
import { contentHash } from './file-diff.js';

/** Solo el host puede construir este alcance a partir de una autorización humana.
 * No se acepta desde argumentos MCP, variables de entorno o archivos del proyecto. */
export type WriteApproval = {
  sourceAlias: string;
  path: string;
  originalContent: string;
  proposedContent: string;
};
type Phase = 'approved' | 'unlocked' | 'written' | 'change_saved' | 'restoration_written' | 'restored' | 'uncertain';
type Target = { page: Page; id: string; panel: Locator; cm: Locator; tab: Locator; table: Locator };
type BrowserCM = {
  getValue(): string; setValue(value: string): void; getOption(name: string): unknown;
  getTextArea(): HTMLTextAreaElement; isClean(): boolean;
};
type BrowserStore = Record<string, { mirror: BrowserCM; options: { saved: boolean; blocked: string } }>;

function deny(code: string, message: string): never { throw new ReadError(code, message); }

export class ControlledWriter extends ModuleReader {
  private readonly approval?: Readonly<WriteApproval>;
  private phase: Phase = 'approved';
  private backupPath?: string;
  private readonly backupRoot: string;

  constructor(pages: () => Page[], approval?: WriteApproval, backupRoot?: string) {
    super(pages);
    this.approval = approval ? Object.freeze({ ...approval }) : undefined;
    if (approval) {
      filePath(approval.path);
      if (approval.originalContent === approval.proposedContent) throw new Error('La aprobación requiere un cambio explícito.');
    }
    this.backupRoot = backupRoot ?? resolve(fileURLToPath(new URL('../', import.meta.url)), '.playwright/backups');
  }

  private scope(sourceAlias: string, path: string) {
    if (!this.approval) deny('WRITE_APPROVAL_REQUIRED', 'No hay autorización humana activa. No se tocó el navegador.');
    filePath(path);
    if (sourceAlias !== this.approval.sourceAlias || path !== this.approval.path) deny('WRITE_SCOPE_MISMATCH', 'El archivo no pertenece al único alcance autorizado.');
    if (this.phase === 'restored') deny('WRITE_APPROVAL_CONSUMED', 'La prueba autorizada ya restauró el original; no permite más mutaciones.');
    if (this.phase === 'uncertain') deny('WRITE_RESULT_UNCERTAIN', 'La operación anterior no pudo verificarse. Conservá la copia; no se reintenta automáticamente.');
    return this.approval;
  }

  private async target(sourceAlias: string, path: string): Promise<Target> {
    const parts = filePath(path);
    const page = await this.editor(sourceAlias);
    // Resuelve cada segmento exacto dentro de su padre; IDs obtenidos exclusivamente del DOM real.
    const found = await page.locator(MODULE_UI.root).evaluate((root, parts) => {
      let node: Element = root;
      for (const name of parts.slice(1)) {
        const matches = [...node.querySelectorAll(':scope > ul > li')].filter(child =>
          child.querySelector(':scope > span.flextree-node > a.flextree-title')?.textContent?.trim() === name);
        if (matches.length !== 1) return { error: matches.length ? 'UI_MISMATCH' : 'FILE_NOT_FOUND' };
        node = matches[0]!;
      }
      if (node.querySelector(':scope > span.flextree-folder')) return { error: 'NOT_A_FILE' };
      return { id: node.id };
    }, parts);
    if (found.error) deny(found.error, 'No se pudo identificar un archivo único en el árbol abierto.');
    if (!found.id || !/^\d+$/.test(found.id)) mismatch();
    const id = found.id;
    await one(page.locator(`#sourceDirectory li[id="${id}"]`));
    const panel = await one(page.locator(`#files_content > section[id="contentSystem_${id}"]`));
    const tab = await one(page.locator(`#crumbs a[id="showSys${id}"][rel="contentSystem_${id}"]`), true);
    if (await tab.getAttribute('title') !== parts.at(-1)) mismatch();
    const table = await one(panel.locator(`table[id="table_ide_edit_${id}"]`));
    const cm = await one(table.locator('.CodeMirror'));
    const target = { page, id, panel, tab, table, cm };
    await this.othersClean(target);
    await tab.click({ timeout: 5_000 });
    await panel.waitFor({ state: 'visible', timeout: 5_000 });
    return target;
  }

  private async state(target: Target) {
    return target.cm.evaluate((element, id) => {
      const cm = (element as unknown as { CodeMirror?: BrowserCM }).CodeMirror;
      const store = (globalThis as unknown as { editor?: BrowserStore }).editor;
      const entry = store?.[id];
      if (!cm || entry?.mirror !== cm || cm.getTextArea().id !== `code_${id}`) throw new Error('Editor identity mismatch');
      return { content: cm.getValue(), readOnly: cm.getOption('readOnly'), clean: cm.isClean(),
        saved: entry.options.saved, blocked: entry.options.blocked,
        unsaved: document.querySelector(`#showSys${id}`)?.classList.contains('unsaved'),
        developing: document.body.classList.contains('ondevelope') };
    }, target.id);
  }

  private async othersClean(target: Target) {
    const safe = await target.page.locator(MODULE_UI.editors).evaluateAll((elements, targetId) => elements.every(element => {
      const cm = (element as unknown as { CodeMirror?: BrowserCM }).CodeMirror;
      if (!cm) return false;
      const id = cm.getTextArea().id.replace('code_', '');
      if (id === targetId) return true;
      const store = (globalThis as unknown as { editor?: BrowserStore }).editor;
      return cm.isClean() && store?.[id]?.options.saved === true
        && !document.querySelector(`#showSys${id}`)?.classList.contains('unsaved');
    }), target.id);
    if (!safe) deny('UNSAVED_EDITOR', 'Otro editor tiene cambios o un estado no reconocido. No se continúa.');
  }

  private async click(target: Target, action: 'block' | 'save') {
    const title = action === 'block' ? 'Tomar (Ctrl+E)' : 'Guardar (Ctrl+S)';
    const button = await one(target.table.locator(`a.codemirror-ui-button.${action}[original-title="${title}"]`), true);
    if ((await button.getAttribute('class'))?.split(/\s+/).includes('inactive')) deny('CONTROL_INACTIVE', 'El control del archivo está inactivo.');
    const expected = (await this.state(target)).content;
    const responsePromise = target.page.waitForResponse(response => {
      const request = response.request();
      const url = new URL(response.url());
      const params = new URLSearchParams(request.postData() ?? '');
      return url.origin === 'https://ide.ipf.edu.ar' && url.pathname === `/ideFlex/modulos/init/php/${action === 'block' ? 'block' : 'save'}.php`
        && request.method() === 'POST' && params.get('id') === target.id
        && (action !== 'save' || params.get('value') === expected);
    }, { timeout: 15_000 });
    let response;
    try {
      await button.click({ timeout: 5_000 });
      response = await responsePromise;
    } catch (error) { void responsePromise.catch(() => undefined); throw error; }
    if (!response.ok()) deny('WRITE_HTTP_ERROR', 'FlexIDE no confirmó la operación mediante una respuesta HTTP exitosa.');
    const result = await target.page.evaluate(xml => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const ids = doc.querySelectorAll('result resultid');
      const texts = doc.querySelectorAll('result resulttext');
      if (doc.querySelector('parsererror') || ids.length !== 1 || texts.length !== 1) return null;
      return { id: ids[0]!.textContent?.trim(), text: texts[0]!.textContent?.trim() };
    }, await response.text());
    const expectedText = action === 'block' ? 'El archivo se bloqueo correctamente' : 'Archivo guardado correctamente.';
    if (!result || result.id !== target.id || result.text !== expectedText) deny('WRITE_NOT_CONFIRMED', 'La respuesta no confirma exactamente el archivo y el resultado observados.');
    return { resultId: result.id, resultText: result.text };
  }

  unlockFile(sourceAlias: string, path: string) { return this.serialize(async () => {
    const approval = this.scope(sourceAlias, path);
    if (this.phase !== 'approved') deny('WRITE_PHASE_MISMATCH', 'La toma del archivo solo se permite una vez al comienzo.');
    const target = await this.target(sourceAlias, path);
    const before = await this.state(target);
    if (!before.developing) deny('DEVELOPMENT_REQUIRED', 'Iniciá desarrollo con autorización explícita; esta herramienta no lo activa automáticamente.');
    if (before.content !== approval.originalContent || !before.clean || !before.saved || before.unsaved
      || before.readOnly !== true || before.blocked !== 'noBlocked') deny('WRITE_PRECONDITION', 'El original cambió, hay cambios pendientes o el archivo no está libre.');
    try {
      const response = await this.click(target, 'block');
      await target.page.waitForFunction(id => {
        const e = (globalThis as unknown as { editor: BrowserStore }).editor[id];
        return e?.mirror.getOption('readOnly') === false && e.options.blocked === 'blockedByMe';
      }, target.id, { timeout: 10_000 });
      if ((await this.state(target)).content !== approval.originalContent) mismatch();
      this.phase = 'unlocked';
      return { path, editable: true, ...response };
    } catch (error) { this.phase = 'uncertain'; throw error; }
  }); }

  writeFile(sourceAlias: string, path: string, content: string) { return this.serialize(async () => {
    const approval = this.scope(sourceAlias, path);
    const restoring = this.phase === 'change_saved';
    if (this.phase !== 'unlocked' && !restoring) deny('WRITE_PHASE_MISMATCH', 'Debe desbloquear o verificar el guardado anterior antes de escribir.');
    const expected = restoring ? approval.proposedContent : approval.originalContent;
    const allowed = restoring ? approval.originalContent : approval.proposedContent;
    if (content !== allowed) deny('CONTENT_NOT_APPROVED', 'El contenido difiere del único cambio/restauración autorizados.');
    const target = await this.target(sourceAlias, path);
    const before = await this.state(target);
    if (!before.developing || before.readOnly !== false || before.blocked !== 'blockedByMe'
      || !before.saved || before.unsaved || before.content !== expected || !before.clean) deny('WRITE_PRECONDITION', 'Estado editable, contenido original o guardado previo no verificables.');
    if (!this.backupPath) {
      await mkdir(this.backupRoot, { recursive: true, mode: 0o700 });
      const backup = resolve(this.backupRoot, `${randomUUID()}.json`);
      await writeFile(backup, JSON.stringify({ sourceAlias, path, originalContent: approval.originalContent,
        originalSha256: contentHash(approval.originalContent) }), { flag: 'wx', mode: 0o600 });
      const stored = JSON.parse(await readFile(backup, 'utf8')) as { originalContent: string };
      if (stored.originalContent !== approval.originalContent) deny('BACKUP_NOT_VERIFIED', 'No se verificó la copia local; no se escribe.');
      this.backupPath = backup;
    }
    try {
      await target.cm.evaluate((element, args) => {
        const cm = (element as unknown as { CodeMirror: BrowserCM }).CodeMirror;
        const entry = (globalThis as unknown as { editor: BrowserStore }).editor[args.id];
        if (entry?.mirror !== cm || !entry.options.saved || cm.getValue() !== args.expected
          || cm.getOption('readOnly') !== false || entry.options.blocked !== 'blockedByMe') throw new Error('Write precondition changed');
        cm.setValue(args.content);
      }, { id: target.id, expected, content });
      const after = await this.state(target);
      if (after.content !== content || after.saved || !after.unsaved) mismatch();
      this.phase = restoring ? 'restoration_written' : 'written';
      return { path, sha256: contentHash(content), saved: false, synchronized: false, backupPath: this.backupPath };
    } catch (error) { this.phase = 'uncertain'; throw error; }
  }); }

  saveFile(sourceAlias: string, path: string) { return this.serialize(async () => {
    const approval = this.scope(sourceAlias, path);
    const restoring = this.phase === 'restoration_written';
    if (this.phase !== 'written' && !restoring) deny('WRITE_PHASE_MISMATCH', 'Solo se guarda el archivo modificado por la escritura autorizada.');
    const expected = restoring ? approval.originalContent : approval.proposedContent;
    const target = await this.target(sourceAlias, path);
    const before = await this.state(target);
    if (!before.developing || before.content !== expected || before.readOnly !== false || before.saved
      || !before.unsaved || before.blocked !== 'blockedByMe') deny('WRITE_PRECONDITION', 'No se reconoce el único buffer pendiente autorizado.');
    try {
      const response = await this.click(target, 'save');
      await target.page.waitForFunction(id => {
        const e = (globalThis as unknown as { editor: BrowserStore }).editor[id];
        return e?.options.saved === true && !document.querySelector(`#showSys${id}`)?.classList.contains('unsaved');
      }, target.id, { timeout: 10_000 });
      if ((await this.state(target)).content !== expected) mismatch();
      // Lectura nueva desde el servidor mediante cierre y apertura de la UI, sin ejecutar endpoints directamente.
      const close = await one(target.page.locator(`#crumbs a[id="closeMod_${target.id}"][rel="contentSystem_${target.id}"][title="Cerrar archivo"]`), true);
      await close.click({ timeout: 5_000 });
      await target.panel.waitFor({ state: 'detached', timeout: 5_000 });
      const freshResponse = target.page.waitForResponse(r => new URL(r.url()).origin === 'https://ide.ipf.edu.ar'
        && new URL(r.url()).pathname === '/ideFlex/modulos/init/php/file.php' && r.request().method() === 'POST'
        && new URLSearchParams(r.request().postData() ?? '').get('id') === target.id, { timeout: 15_000 });
      try {
        await (await one(target.page.locator(`#sourceDirectory li[id="${target.id}"] > span > a.flextree-title`), true)).click({ timeout: 5_000 });
        if (!(await freshResponse).ok()) deny('PERSISTENCE_NOT_VERIFIED', 'La reapertura no devolvió un archivo verificable.');
      } catch (error) { void freshResponse.catch(() => undefined); throw error; }
      await target.page.locator(`#contentSystem_${target.id} .CodeMirror`).waitFor({ state: 'visible', timeout: 10_000 });
      const fresh = await this.target(sourceAlias, path);
      const after = await this.state(fresh);
      if (after.content !== expected || contentHash(after.content) !== contentHash(expected)
        || !after.saved || after.unsaved || !after.clean) deny('PERSISTENCE_NOT_VERIFIED', 'El contenido reabierto no coincide exactamente con el guardado.');
      this.phase = restoring ? 'restored' : 'change_saved';
      return { path, saved: true, persistenceVerified: true, sha256: contentHash(after.content),
        restored: restoring, approvalConsumed: restoring, synchronized: false, ...response };
    } catch (error) { this.phase = 'uncertain'; throw error; }
  }); }
}
