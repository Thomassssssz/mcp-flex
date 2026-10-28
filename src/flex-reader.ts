import type { Locator, Page } from 'playwright';

// Selectores observados el 2026-10-28. Ver docs/inspeccion-flexide.md.
export const UI = {
  user: 'a#userName',
  logout: 'a#close_session[href="logoutAccount"]',
  sourcesMenu: 'a[id="7"].openSys',
  sourceGrid: '#contentSystem_7 table[id="grid_fuentes_solo_id_devsoem01"]',
  sourceWrapper: '#contentSystem_7 div.flex.flexGrid',
  dbTree: '#tree_ide_db',
  dbRoot: '#tree_ide_db > ul.flextree-container > li[id="root"]',
  moduleRoot: '#sourceDirectory > ul.flextree-container > li[id="root"] > span > a.flextree-title',
  sourceBanner: '#notification_login > strong',
} as const;

export class ReadError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new ReadError(code, message); }
export function mismatch(): never { return fail('UI_MISMATCH', 'La interfaz no coincide con la estructura inspeccionada. No se continuó.'); }
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const identifier = /^[A-Za-z0-9_]+$/;
function id(value: string) {
  // No interpolar selectores provistos por el cliente sin validar.
  if (!identifier.test(value) || value.length > 128) fail('INVALID_IDENTIFIER', 'Nombre de base o tabla no admitido.');
  return `[id="${value}"]`;
}
function isPage(page: Page, path: string) {
  try { const u = new URL(page.url()); return u.origin === 'https://ide.ipf.edu.ar' && u.pathname === path; }
  catch { return false; }
}
export async function one(locator: Locator, visible = false) {
  if (await locator.count() !== 1 || (visible && !await locator.isVisible())) mismatch();
  return locator;
}
async function text(locator: Locator) { return clean(await (await one(locator)).innerText({ timeout: 5_000 })); }
export async function label(node: Locator) { return text(node.locator(':scope > span.flextree-node > a.flextree-title')); }

export class FlexReader {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly pages: () => Page[]) {}

  protected serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.catch(() => undefined).then(operation);
    this.pending = next;
    return next;
  }

  async checkSession() {
    const pages = this.pages().filter(p => !p.isClosed());
    let confirmed = false;
    let uncertain = false;
    let managerCount = 0;
    for (const page of pages.filter(p => isPage(p, '/'))) {
      managerCount++;
      try {
        const user = page.locator(UI.user);
        const logout = page.locator(UI.logout);
        const menu = page.locator(UI.sourcesMenu);
        const match = await user.count() === 1 && await user.isVisible()
          && Boolean(await text(user)) && await logout.count() === 1
          && await text(logout) === 'Cerrar Sesión'
          && await menu.count() === 1 && await text(menu) === 'Fuentes'
          && await page.locator('input[type="password"]:visible').count() === 0;
        if (match) confirmed = true; else uncertain = true;
      } catch { uncertain = true; }
    }
    const authentication = confirmed && !uncertain ? 'authenticated' : 'unknown';
    return {
      browserOpen: pages.length > 0, pageCount: pages.length, managerCount, authentication,
      evidence: authentication === 'authenticated' ? ['user_menu', 'logout_link', 'sources_menu'] : [],
      message: authentication === 'authenticated'
        ? 'Interfaz autenticada reconocida en el DOM. No verifica vigencia de la sesión en el servidor.'
        : 'No se pudo reconocer una sesión autenticada. Abrí el gestor e iniciá sesión manualmente si corresponde.',
    };
  }

  private async requireSession() {
    if ((await this.checkSession()).authentication !== 'authenticated') {
      fail('SESSION_UNVERIFIED', 'Sesión no reconocida. Abrí el gestor autenticado; no se iniciará sesión automáticamente.');
    }
  }

  listSources() { return this.serialize(async () => {
    await this.requireSession();
    const candidates = [];
    for (const page of this.pages().filter(p => isPage(p, '/'))) {
      if (await page.locator(UI.sourceGrid).count()) candidates.push(page);
    }
    if (candidates.length !== 1) fail('SOURCES_VIEW_REQUIRED', 'Abrí una única pantalla de Fuentes y ejecutá Buscar Fuentes manualmente.');
    const page = candidates[0]!;
    const grid = await one(page.locator(UI.sourceGrid), true);
    const wrapper = await one(page.locator(UI.sourceWrapper), true);
    // No confundir una grilla todavía sin consultar con cero fuentes.
    const pagination = await one(wrapper.locator('.pDiv'), true);
    const current = Number(await (await one(pagination.locator('.pcontrol input'))).inputValue());
    const totalPages = Number(await text(pagination.locator('.totalPage')));
    const totalText = await text(pagination.locator('.statTotal'));
    const totalMatch = /^(\d+) registros$/.exec(totalText);
    if (!totalMatch || !Number.isInteger(current) || current < 1 || !Number.isInteger(totalPages) || totalPages < 1) mismatch();
    const rows = grid.locator(':scope > tbody > tr');
    const sources = [];
    const seen = new Set<string>();
    for (const row of await rows.all()) {
      const sourceId = await row.getAttribute('id');
      const cellId = await text(row.locator('td[name="id_devsoem01"]'));
      const alias = await text(row.locator('td[name="devsoem01_alias"]'));
      const name = await text(row.locator('td[name="devsoem01_nombre"]'));
      const productionDatabase = await text(row.locator('td[name="devsoem01_bd_prod"]'));
      const entry = row.locator('td[name="devsoem01_alias"] span.ActionsLink');
      if (!sourceId || !/^\d+$/.test(sourceId) || sourceId !== cellId || !alias || !name
        || seen.has(sourceId) || await entry.count() !== 1
        || await entry.getAttribute('original-title') !== `Interfaz de desarrollo | Id: ${sourceId}`) mismatch();
      seen.add(sourceId);
      sources.push({ id: sourceId, alias, name, productionDatabase });
    }
    if (!sources.length || sources.length > Number(totalMatch[1])) {
      fail('SOURCES_NOT_READY', 'No hay filas verificables en la grilla. No se asume que la lista esté vacía.');
    }
    await this.requireSession();
    return { sources, pagination: { current, totalPages, totalRecords: Number(totalMatch[1]) },
      scope: 'current_filtered_page', complete: current === 1 && totalPages === 1 && sources.length === Number(totalMatch[1]) };
  }); }

  protected async editor(sourceAlias: string) {
    if (!sourceAlias.trim() || sourceAlias.length > 200) fail('INVALID_SOURCE', 'Indicá el alias exacto de la fuente.');
    await this.requireSession();
    const matches: Page[] = [];
    for (const page of this.pages().filter(p => isPage(p, '/ideFlex/'))) {
      if (await page.locator(UI.sourceBanner).count() !== 1) continue;
      const source = clean(await page.locator(UI.sourceBanner).evaluate(e =>
        [...e.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('')));
      if (source === `Fuente ${sourceAlias}`) matches.push(page);
    }
    if (matches.length !== 1) fail('EDITOR_REQUIRED', 'Abrí un único editor de la fuente indicada desde su engranaje en Fuentes. No se abrirá automáticamente.');
    const page = matches[0]!;
    await one(page.locator(UI.dbRoot));
    if (await label(page.locator(UI.dbRoot)) !== 'Bases de Datos'
      || await text(page.locator(UI.moduleRoot)) !== 'modulos') mismatch();
    return page;
  }

  protected async expand(node: Locator) {
    await one(node);
    const span = await one(node.locator(':scope > span.flextree-node'));
    if (!(await span.getAttribute('class'))?.split(/\s+/).includes('flextree-expanded')) {
      const expander = await one(span.locator(':scope > span.flextree-expander'), true);
      await expander.click({ timeout: 5_000 });
    }
    await node.locator(':scope > span.flextree-expanded').waitFor({ state: 'attached', timeout: 8_000 });
    // Espera carga lazy. Una respuesta vacía/no reconocible falla por timeout, nunca se inventa un resultado.
    await node.locator(':scope > ul > li').first().waitFor({ state: 'attached', timeout: 8_000 });
  }

  private async tablesNode(sourceAlias: string, database: string) {
    id(database);
    const page = await this.editor(sourceAlias);
    const header = await one(page.locator('h3[role="tab"]').filter({ hasText: /^Base de Datos$/ }), true);
    const expanded = await header.getAttribute('aria-expanded');
    if (expanded === 'false') await header.click({ timeout: 5_000 });
    else if (expanded !== 'true') mismatch();
    await page.locator(UI.dbTree).waitFor({ state: 'visible', timeout: 5_000 });
    const databases = page.locator(`${UI.dbRoot} > ul > li`);
    // ID y etiqueta se verifican dentro del nivel exacto, ya que el árbol repite IDs.
    const selected = page.locator(`${UI.dbRoot} > ul > li${id(database)}`);
    if (await selected.count() !== 1) {
      const available = [];
      for (const node of await databases.all()) available.push({ database: await node.getAttribute('id'), label: await label(node) });
      fail('DATABASE_NOT_FOUND', `Base no encontrada en esta fuente. Disponibles: ${JSON.stringify(available)}`);
    }
    const dbLabel = await label(selected);
    if (dbLabel !== `${database} - PROD` && dbLabel !== `${database} - DESA`) mismatch();
    await this.expand(selected);
    const tables = selected.locator(':scope > ul > li[id="tables"]');
    if (await label(tables) !== 'Tablas') mismatch();
    await this.expand(tables);
    return { page, tables, dbLabel };
  }

  private async readTables(tables: Locator) {
    const names: string[] = [];
    for (const node of await tables.locator(':scope > ul > li').all()) {
      const name = await node.getAttribute('id');
      if (!name || !identifier.test(name) || await label(node) !== name || names.includes(name)) mismatch();
      names.push(name);
    }
    if (!names.length) mismatch();
    return names;
  }

  listTables(sourceAlias: string, database: string) { return this.serialize(async () => {
    const { tables, dbLabel } = await this.tablesNode(sourceAlias, database);
    const names = await this.readTables(tables);
    await this.editor(sourceAlias);
    return { sourceAlias, database, databaseLabel: dbLabel, tables: names, scope: 'loaded_database_tree', freshness: 'current_ui' };
  }); }

  describeTable(sourceAlias: string, database: string, table: string) { return this.serialize(async () => {
    id(table);
    const { tables, dbLabel } = await this.tablesNode(sourceAlias, database);
    const names = await this.readTables(tables);
    if (!names.includes(table)) fail('TABLE_NOT_FOUND', 'La tabla no existe en el árbol de la base indicada.');
    const node = tables.locator(`:scope > ul > li${id(table)}`);
    await this.expand(node);
    const fields = [];
    const seen = new Set<string>();
    for (const field of await node.locator(':scope > ul > li').all()) {
      const name = await field.getAttribute('id');
      const value = await label(field);
      if (!name || !identifier.test(name) || seen.has(name) || !value.startsWith(`${name} (`) || !value.endsWith(')')) mismatch();
      const type = value.slice(name.length + 2, -1);
      if (!type || /[<>\r\n]/.test(type)) mismatch();
      seen.add(name);
      fields.push({ name, type });
    }
    if (!fields.length) mismatch();
    await this.editor(sourceAlias);
    return { sourceAlias, database, databaseLabel: dbLabel, table, fields,
      metadata: 'Solo nombre y tipo visibles. Claves, longitudes, nulabilidad y valores predeterminados no inspeccionados.' };
  }); }
}
