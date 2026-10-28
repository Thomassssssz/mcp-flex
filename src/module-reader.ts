import { createHash } from 'node:crypto';
import type { Locator, Page } from 'playwright';
import { FlexReader, ReadError, one, label, mismatch } from './flex-reader.js';
import { summarizeModule } from './module-summary.js';

export const MODULE_UI = {
  root: '#sourceDirectory > ul.flextree-container > li[id="root"]',
  editors: '#files_content section.contentSystem .CodeMirror',
} as const;

type Entry = { name: string; path: string; kind: 'folder' | 'file'; nodeId: string; node: Locator };
export type ModuleEntry = { name: string; path: string; kind: 'folder' | 'file'; area: 'php' | 'templates' | 'other' };
export type FileRead = { path: string; content: string; characters: number; lines: number; sha256: string; readOnly: true; clean: true };

function segment(value: string) {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(value) || value.length > 200) {
    throw new ReadError('INVALID_PATH', 'Usá nombres simples del árbol; no se admiten rutas absolutas, traversal, escapes ni selectores.');
  }
  return value;
}
function filePath(path: string) {
  const parts = path.split('/');
  if (parts.length < 3 || parts[0] !== 'modulos') throw new ReadError('INVALID_PATH', 'La ruta debe comenzar con modulos/<módulo>/ y terminar en un archivo.');
  parts.forEach(segment);
  return parts;
}
function classes(value: string | null) { return (value ?? '').split(/\s+/); }

export class ModuleReader extends FlexReader {
  private async filesView(sourceAlias: string) {
    const page = await this.editor(sourceAlias);
    const header = await one(page.locator('h3[role="tab"]').filter({ hasText: `Archivos - ${sourceAlias}` }), true);
    if ((await header.innerText()).trim() !== `Archivos - ${sourceAlias}`) mismatch();
    const expanded = await header.getAttribute('aria-expanded');
    if (expanded === 'false') await header.click({ timeout: 5_000 });
    else if (expanded !== 'true') mismatch();
    const root = await one(page.locator(MODULE_UI.root), true);
    if (await label(root) !== 'modulos') mismatch();
    await this.expand(root);
    return { page, root };
  }

  private async entries(parent: Locator, path: string): Promise<Entry[]> {
    const entries: Entry[] = [];
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const node of await parent.locator(':scope > ul > li').all()) {
      const name = await label(node);
      segment(name);
      const nodeId = await node.getAttribute('id');
      const span = await one(node.locator(':scope > span.flextree-node'));
      const folder = classes(await span.getAttribute('class')).includes('flextree-folder');
      if (!nodeId || !/^\d+$/.test(nodeId) || ids.has(nodeId) || names.has(name)) mismatch();
      // Archivo observado: conector + imagen; una forma desconocida no se trata como archivo.
      if (!folder && (await span.locator(':scope > span.flextree-connector').count() !== 1
        || await span.locator(':scope > img').count() !== 1)) mismatch();
      names.add(name); ids.add(nodeId);
      entries.push({ name, path: `${path}/${name}`, kind: folder ? 'folder' : 'file', nodeId, node });
    }
    if (!entries.length) throw new ReadError('TREE_NOT_READY', 'El directorio no tiene hijos verificables; no se asume vacío.');
    return entries;
  }

  listModules(sourceAlias: string) { return this.serialize(async () => {
    const { root } = await this.filesView(sourceAlias);
    const entries = await this.entries(root, 'modulos');
    if (entries.some(e => e.kind !== 'folder')) mismatch();
    await this.editor(sourceAlias);
    return { sourceAlias, modules: entries.map(({ name, path }) => ({ name, path })), freshness: 'current_ui' };
  }); }

  private async module(sourceAlias: string, module: string) {
    segment(module);
    const { page, root } = await this.filesView(sourceAlias);
    const entries = await this.entries(root, 'modulos');
    const entry = entries.find(e => e.name === module);
    if (!entry || entry.kind !== 'folder') throw new ReadError('MODULE_NOT_FOUND', 'El módulo no existe como carpeta en el árbol de esta fuente.');
    await this.expand(entry.node);
    return { page, entry };
  }

  private async structure(sourceAlias: string, module: string) {
    const { page, entry } = await this.module(sourceAlias, module);
    const output: ModuleEntry[] = [];
    const visited = new Set<string>([entry.nodeId]);
    const walk = async (parent: Locator, path: string, depth: number) => {
      if (depth > 12) throw new ReadError('TREE_LIMIT', 'La profundidad del módulo supera el límite seguro de inspección.');
      for (const child of await this.entries(parent, path)) {
        if (visited.has(child.nodeId)) mismatch();
        if (output.length >= 500) throw new ReadError('TREE_LIMIT', 'El módulo supera 500 entradas. No se devuelve una estructura parcial como completa.');
        visited.add(child.nodeId);
        const area = child.path.split('/')[2];
        output.push({ name: child.name, path: child.path, kind: child.kind, area: area === 'php' || area === 'templates' ? area : 'other' });
        if (child.kind === 'folder') {
          await this.expand(child.node);
          await walk(child.node, child.path, depth + 1);
        }
      }
    };
    await walk(entry.node, entry.path, 0);
    await this.editor(sourceAlias);
    return { page, sourceAlias, module, path: entry.path, entries: output };
  }

  listModuleFiles(sourceAlias: string, module: string) { return this.serialize(async () => {
    const { page: _page, ...result } = await this.structure(sourceAlias, module);
    return { ...result, freshness: 'current_ui' };
  }); }

  private async ensureCleanEditors(page: Page) {
    const safe = await page.locator(MODULE_UI.editors).evaluateAll(elements => elements.every(element => {
      const cm = (element as unknown as { CodeMirror?: { isClean?: () => boolean } }).CodeMirror;
      return Boolean(cm && typeof cm.isClean === 'function' && cm.isClean());
    }));
    if (!safe) throw new ReadError('UNSAVED_EDITOR', 'Hay un editor desconocido o con cambios pendientes. No se abrirán ni recargarán archivos.');
  }

  private async read(sourceAlias: string, path: string): Promise<FileRead> {
    const parts = filePath(path);
    const { page, entry } = await this.module(sourceAlias, parts[1]!);
    await this.ensureCleanEditors(page);
    let current = entry;
    for (let i = 2; i < parts.length; i++) {
      const entries = await this.entries(current.node, current.path);
      const next = entries.find(e => e.name === parts[i]);
      if (!next) throw new ReadError('FILE_NOT_FOUND', 'La ruta no existe en la estructura real del módulo.');
      current = next;
      if (i < parts.length - 1) {
        if (current.kind !== 'folder') throw new ReadError('NOT_A_DIRECTORY', 'Un componente de la ruta no es una carpeta.');
        await this.expand(current.node);
      }
    }
    if (current.kind !== 'file') throw new ReadError('NOT_A_FILE', 'La ruta indicada no es un archivo.');
    const nodeId = current.nodeId;
    // IDs derivados únicamente del nodo real y comprobados contra panel, tabla, pestaña y textarea.
    if (await page.locator(`#sourceDirectory li[id="${nodeId}"]`).count() !== 1) mismatch();
    const panel = page.locator(`#files_content > section[id="contentSystem_${nodeId}"]`);
    if (await panel.count() > 1) mismatch();
    if (await panel.count() === 0) {
      await (await one(current.node.locator(':scope > span > a.flextree-title'), true)).click({ timeout: 5_000 });
    } else {
      // Activar pestaña existente sin volver a pedir el archivo ni descartar un buffer.
      await (await one(page.locator(`#crumbs a[id="showSys${nodeId}"][rel="contentSystem_${nodeId}"]`), true)).click({ timeout: 5_000 });
    }
    await panel.waitFor({ state: 'visible', timeout: 10_000 });
    await one(panel, true);
    const activeTab = page.locator(`#crumbs > li.active > a[id="showSys${nodeId}"][rel="contentSystem_${nodeId}"]`);
    await activeTab.waitFor({ state: 'visible', timeout: 10_000 });
    const tab = await one(activeTab, true);
    if (await tab.getAttribute('title') !== current.name) mismatch();
    const tableLocator = panel.locator(`table[id="table_ide_edit_${nodeId}"]`);
    await tableLocator.waitFor({ state: 'visible', timeout: 10_000 });
    const table = await one(tableLocator, true);
    await table.locator('.CodeMirror').waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForFunction(panelId => {
      const elements = document.querySelectorAll(`#${panelId} .CodeMirror`);
      return elements.length === 1 && Boolean((elements[0] as unknown as { CodeMirror?: unknown }).CodeMirror);
    }, `contentSystem_${nodeId}`, { timeout: 10_000 });
    const area = await one(table.locator(`textarea[id="code_${nodeId}"][name="code_${nodeId}"]`));
    const cmElement = await one(table.locator('.CodeMirror'), true);
    const snapshot = await cmElement.evaluate((element, expectedAreaId) => {
      type CM = { getValue(): string; getOption(name: string): unknown; isClean(): boolean; lineCount(): number; getTextArea(): HTMLTextAreaElement };
      const cm = (element as unknown as { CodeMirror?: CM }).CodeMirror;
      if (!cm || ['getValue', 'getOption', 'isClean', 'lineCount', 'getTextArea'].some(name => typeof (cm as unknown as Record<string, unknown>)[name] !== 'function')) return null;
      const content = cm.getValue();
      const area = cm.getTextArea();
      return { content, readOnly: cm.getOption('readOnly'), clean: cm.isClean(), lines: cm.lineCount(),
        areaMatches: area.id === expectedAreaId && area.value === content && element.parentElement?.contains(area) };
    }, await area.getAttribute('id'));
    if (!snapshot || !snapshot.areaMatches || typeof snapshot.content !== 'string'
      || snapshot.lines !== snapshot.content.split('\n').length) mismatch();
    if (snapshot.readOnly !== true || snapshot.clean !== true) {
      throw new ReadError('EDITOR_NOT_READ_ONLY', 'El archivo no está en el estado observado de solo lectura y sin cambios. No se toca su estado.');
    }
    await this.ensureCleanEditors(page);
    await this.editor(sourceAlias);
    return { path, content: snapshot.content, characters: snapshot.content.length, lines: snapshot.lines,
      sha256: createHash('sha256').update(snapshot.content, 'utf8').digest('hex'), readOnly: true, clean: true };
  }

  readFile(sourceAlias: string, path: string) { return this.serialize(() => this.read(sourceAlias, path)); }

  getModuleSummary(sourceAlias: string, module: string) { return this.serialize(async () => {
    const structure = await this.structure(sourceAlias, module);
    const expected = [`php/ver_${module}.php`, `php/ver_${module}_abm.php`, 'templates/ver_grid.html', 'templates/ver_form.html'];
    const files: FileRead[] = [];
    const missing: string[] = [];
    for (const relative of expected) {
      const path = `${structure.path}/${relative}`;
      const existing = structure.entries.find(e => e.path === path);
      if (!existing) { missing.push(path); continue; }
      if (existing.kind !== 'file') mismatch();
      files.push(await this.read(sourceAlias, path));
    }
    if (!files.length) throw new ReadError('NO_SUMMARY_FILES', 'No existe ninguno de los cuatro archivos esperados. No se genera un resumen supuesto.');
    return { sourceAlias, module, path: structure.path, missing, partial: missing.length > 0, ...summarizeModule(files) };
  }); }
}
