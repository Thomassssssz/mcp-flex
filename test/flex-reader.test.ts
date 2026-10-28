import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { FlexReader, ReadError } from '../src/flex-reader.js';

// Fixtures sintéticas del contrato DOM observado. Todos los requests se interceptan:
// estas pruebas nunca acceden al servidor real ni usan el perfil del usuario.
const managerHtml = `<!doctype html><html><body>
<a id="userName">fixture-user</a><a id="close_session" href="logoutAccount">Cerrar Sesión</a>
<a id="7" class="openSys">Fuentes</a>
<section id="contentSystem_7"><div class="flex flexGrid"><div class="bDiv striped">
<table id="grid_fuentes_solo_id_devsoem01"><tbody><tr id="42">
<td name="id_devsoem01" style="display:none">42</td>
<td name="devsoem01_alias"><span class="ActionsLink" original-title="Interfaz de desarrollo | Id: 42"></span>Fixture</td>
<td name="devsoem01_nombre" style="display:none">Fixture Source</td>
<td name="devsoem01_bd_prod">fixture_db</td></tr></tbody></table></div>
<div class="pDiv"><span class="pcontrol"><input value="1"><span class="totalPage">1</span></span>
<strong class="statTotal">1 registros</strong></div></div></section></body></html>`;

function node(name: string, title: string, children = '', expanded = false) {
  return `<li id="${name}"><span class="flextree-node${expanded ? ' flextree-expanded' : ''}"><span class="flextree-expander"></span><a class="flextree-title">${title}</a></span>${children ? `<ul style="display:${expanded ? 'block' : 'none'}">${children}</ul>` : ''}</li>`;
}
const fieldNodes = node('id_fixture', 'id_fixture (int)') + node('fixture_name', 'fixture_name (varchar)');
const tableNodes = node('fixture_table', 'fixture_table', fieldNodes);
const databases = node('fixture_db', 'fixture_db - PROD', node('tables', 'Tablas', tableNodes))
  + node('desa_fixture_db', 'desa_fixture_db - DESA', node('tables', 'Tablas', node('different_table', 'different_table', node('other_field', 'other_field (decimal)'))));
const editorHtml = `<!doctype html><html><body>
<style>.flextree-expander { display:inline-block; width:16px; height:16px; }</style>
<div id="notification_login"><strong>Fuente Fixture <a>Cambiar vista</a></strong></div>
<div id="sourceDirectory"><ul class="flextree-container">${node('root', 'modulos')}</ul></div>
<h3 role="tab" aria-expanded="false">Base de Datos</h3>
<div id="tree_ide_db" style="display:none"><ul class="flextree-container">${node('root', 'Bases de Datos', databases, true)}</ul></div>
<script>
globalThis.actions=[];
document.addEventListener('click', e=>{
  globalThis.actions.push(e.target.className || e.target.tagName);
  if(e.target.matches('h3')) { e.target.setAttribute('aria-expanded','true');document.querySelector('#tree_ide_db').style.display='block'; }
  if(e.target.matches('.flextree-expander')) {
    const span=e.target.parentElement;span.classList.add('flextree-expanded');
    const ul=span.parentElement.querySelector(':scope > ul');if(ul)ul.style.display='block';
  }
});
</script></body></html>`;

async function expectCode(operation: Promise<unknown>, code: string) {
  await assert.rejects(operation, (e: unknown) => e instanceof ReadError && e.code === code);
}

test('lecturas verificadas y rechazo de cambios/ambigüedades con DOM local', async t => {
  const browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext();
  const remoteRequests: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://ide.ipf.edu.ar' && ['/', '/ideFlex/'].includes(url.pathname)) {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: url.pathname === '/' ? managerHtml : editorHtml });
    } else { remoteRequests.push(url.origin); await route.abort(); }
  });
  let manager: Page;
  let editor: Page;
  const reader = new FlexReader(() => context.pages());
  const reset = async () => {
    for (const page of context.pages()) await page.close();
    manager = await context.newPage(); await manager.goto('https://ide.ipf.edu.ar/');
    editor = await context.newPage(); await editor.goto('https://ide.ipf.edu.ar/ideFlex/');
  };
  try {
    await t.test('sin navegador la autenticación es desconocida', async () => {
      const result = await reader.checkSession();
      assert.equal(result.authentication, 'unknown'); assert.equal(result.browserOpen, false);
      await expectCode(reader.listSources(), 'SESSION_UNVERIFIED');
    });
    await t.test('reconoce el shell sin devolver nombre de usuario', async () => {
      await reset();
      const result = await reader.checkSession();
      assert.equal(result.authentication, 'authenticated', JSON.stringify({
        result, url: manager.url(), user: await manager.locator('a#userName').innerText(),
        visible: await manager.locator('a#userName').isVisible(),
        logout: await manager.locator('a#close_session[href="logoutAccount"]').innerText(),
        menu: await manager.locator('a[id="7"].openSys').innerText(),
      }));
      assert(!JSON.stringify(result).includes('fixture-user'));
    });
    await t.test('lee IDs, alias y paginación; reconoce resultados parciales', async () => {
      await reset();
      const result = await reader.listSources();
      assert.deepEqual(result.sources, [{ id: '42', alias: 'Fixture', name: 'Fixture Source', productionDatabase: 'fixture_db' }]);
      assert.equal(result.complete, true);
      await manager.locator('.totalPage').evaluate(e => e.textContent = '2');
      await manager.locator('.statTotal').evaluate(e => e.textContent = '50 registros');
      assert.equal((await reader.listSources()).complete, false);
    });
    await t.test('no toma una grilla sin búsqueda por una lista vacía', async () => {
      await reset();
      await manager.locator('.pDiv').evaluate(e => e.remove());
      await expectCode(reader.listSources(), 'UI_MISMATCH');
    });
    await t.test('ID inconsistente, columnas faltantes y filas duplicadas fallan', async () => {
      for (const change of ['id', 'column', 'duplicate']) {
        await reset();
        await manager.evaluate(change => {
          const row = document.querySelector('tr')!;
          if (change === 'id') row.id = '99';
          if (change === 'column') row.querySelector('[name="devsoem01_alias"]')!.remove();
          if (change === 'duplicate') row.parentElement!.append(row.cloneNode(true));
        }, change);
        await expectCode(reader.listSources(), 'UI_MISMATCH');
      }
    });
    await t.test('árboles por base exacta, IDs repetidos entre PROD y DESA', async () => {
      await reset();
      assert.deepEqual((await reader.listTables('Fixture', 'fixture_db')).tables, ['fixture_table']);
      assert.deepEqual((await reader.listTables('Fixture', 'desa_fixture_db')).tables, ['different_table']);
      const result = await reader.describeTable('Fixture', 'fixture_db', 'fixture_table');
      assert.deepEqual(result.fields, [{ name: 'id_fixture', type: 'int' }, { name: 'fixture_name', type: 'varchar' }]);
      const actions = await editor.evaluate(() => (globalThis as unknown as { actions: string[] }).actions);
      assert(actions.every(a => a === 'H3' || a === 'flextree-expander'));
      const count = actions.length;
      await reader.describeTable('Fixture', 'fixture_db', 'fixture_table');
      assert.equal(await editor.evaluate(() => (globalThis as unknown as { actions: string[] }).actions.length), count);
    });
    await t.test('fuente equivocada, base o tabla ausente y entradas de selector', async () => {
      await reset();
      await expectCode(reader.listTables('Other', 'fixture_db'), 'EDITOR_REQUIRED');
      await expectCode(reader.listTables('Fixture', 'missing_db'), 'DATABASE_NOT_FOUND');
      await expectCode(reader.describeTable('Fixture', 'fixture_db', 'missing_table'), 'TABLE_NOT_FOUND');
      await expectCode(reader.listTables('Fixture', 'fixture_db"] button'), 'INVALID_IDENTIFIER');
      await expectCode(reader.describeTable('Fixture', 'fixture_db', 'table"]'), 'INVALID_IDENTIFIER');
    });
    await t.test('editores duplicados no eligen una fuente arbitrariamente', async () => {
      await reset();
      const duplicate = await context.newPage(); await duplicate.goto('https://ide.ipf.edu.ar/ideFlex/');
      await expectCode(reader.listTables('Fixture', 'fixture_db'), 'EDITOR_REQUIRED');
    });
    await t.test('sin señales, con contraseña visible o en otro origen no reconoce sesión', async () => {
      for (const change of ['logout', 'password', 'origin']) {
        await reset();
        if (change === 'logout') await manager.locator('#close_session').evaluate(e => e.remove());
        if (change === 'password') await manager.evaluate(() => { const i = document.createElement('input'); i.type = 'password'; document.body.append(i); });
        if (change === 'origin') { await manager.close(); await editor.close(); const other = await context.newPage(); await other.setContent(managerHtml); }
        assert.equal((await reader.checkSession()).authentication, 'unknown');
        await expectCode(reader.listTables('Fixture', 'fixture_db'), 'SESSION_UNVERIFIED');
      }
    });
    await t.test('estructura de campos alterada falla, sin inferir el tipo', async () => {
      await reset();
      await editor.locator('li[id="fixture_name"] a').evaluate(e => e.textContent = 'renamed (varchar)');
      await expectCode(reader.describeTable('Fixture', 'fixture_db', 'fixture_table'), 'UI_MISMATCH');
    });
    assert.deepEqual(remoteRequests, []);
  } finally { await context.close(); await browser.close(); }
});
