import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { chromium, type Page } from 'playwright';
import { ModuleReader } from '../src/module-reader.js';
import { ReadError } from '../src/flex-reader.js';

const manager = `<!doctype html><meta charset="utf-8"><a id="userName">fixture</a><a id="close_session" href="logoutAccount">Cerrar Sesión</a><a id="7" class="openSys">Fuentes</a>`;
const contents: Record<string, { name: string; content: string }> = {
  '12': { name: 'ver_demo.php', content: '<?php\n$idFlex="id_demo";\n$title="Demo";\n$sortname="demo_nombre";\n$colModel="{name: \'demo_nombre\'}";\n?>' },
  '13': { name: 'ver_demo_abm.php', content: '<?php\n$qr="Select * from demo_table where id_demo=$id";\n$fields="{field:\'demo_nombre\'}";\n$urlValidator="";\n$onSubmitExecute="";\n?>' },
  '15': { name: 'ver_grid.html', content: '<script>/* fixture only */</script>\n{colModel}\n' + 'a'.repeat(40_000) + '\nEND-OF-FULL-BUFFER' },
  '16': { name: 'ver_form.html', content: '<form>{fields}</form>\n\t<!-- áéíóú -->\n' },
};
function file(id: string, name: string) { return `<li id="${id}"><span class="flextree-node"><span class="flextree-connector"></span><img alt=""><a class="flextree-title">${name}</a></span></li>`; }
function folder(id: string, name: string, children: string) { return `<li id="${id}"><span class="flextree-node flextree-folder"><span class="flextree-expander"></span><a class="flextree-title">${name}</a></span><ul style="display:none">${children}</ul></li>`; }
const tree = folder('root', 'modulos', folder('10', 'demo', folder('11', 'php', file('12', 'ver_demo.php') + file('13', 'ver_demo_abm.php')) + folder('14', 'templates', file('15', 'ver_grid.html') + file('16', 'ver_form.html'))));
const editor = `<!doctype html><meta charset="utf-8"><style>.flextree-expander {display:inline-block;width:16px;height:16px}</style>
<div id="notification_login"><strong>Fuente Fixture <a>Cambiar vista</a></strong></div>
<section id="files_content"><ul id="crumbs"></ul></section>
<h3 role="tab" aria-expanded="false">Archivos - Fixture</h3>
<div id="sourceDirectory" style="display:none"><ul class="flextree-container">${tree}</ul></div>
<div id="tree_ide_db"><ul class="flextree-container"><li id="root"><span class="flextree-node"><a class="flextree-title">Bases de Datos</a></span></li></ul></div>
<script>
globalThis.opened=[];globalThis.forbidden=[];
const files=${JSON.stringify(contents).replaceAll('<', '\\u003c')};
document.addEventListener('click',e=>{
  if(e.target.matches('h3')){e.target.setAttribute('aria-expanded','true');document.querySelector('#sourceDirectory').style.display='block';}
  if(e.target.matches('.flextree-expander')){const span=e.target.parentElement;span.classList.add('flextree-expanded');span.parentElement.querySelector(':scope > ul').style.display='block';}
  if(e.target.matches('.save,.sync,.block'))globalThis.forbidden.push('write-button');
  if(e.target.matches('#sourceDirectory a.flextree-title')&&!e.target.parentElement.classList.contains('flextree-folder')) {
    const id=e.target.parentElement.parentElement.id;const file=files[id];if(!file)return;
    globalThis.opened.push(id);
    const panel=document.createElement('section');panel.id='contentSystem_'+id;panel.className='contentSystem';
    panel.innerHTML='<table id="table_ide_edit_'+id+'"><tbody><tr><td><form><textarea id="code_'+id+'" name="code_'+id+'"></textarea><div class="CodeMirror"></div><a class="save">Guardar</a><a class="sync">Sync</a><a class="block">Tomar</a></form></td></tr></tbody></table>';
    const area=panel.querySelector('textarea');area.value=file.content;
    const cm=panel.querySelector('.CodeMirror');cm.textContent='only viewport: '+file.content.slice(0,20);
    cm.CodeMirror={getValue:()=>area.value,getOption:()=>true,isClean:()=>true,lineCount:()=>area.value.split('\\n').length,getTextArea:()=>area};
    document.querySelector('#files_content').append(panel);
    const li=document.createElement('li');li.innerHTML='<a id="showSys'+id+'" rel="contentSystem_'+id+'"></a>';
    const tab=li.firstElementChild;tab.title=file.name;tab.textContent=file.name;document.querySelector('#crumbs').append(li);tab.click();
  }
  if(e.target.matches('#crumbs a')){
    for(const s of document.querySelectorAll('#files_content > section'))s.style.display=s.id===e.target.getAttribute('rel')?'block':'none';
    for(const l of document.querySelectorAll('#crumbs > li'))l.classList.remove('active');e.target.parentElement.classList.add('active');
  }
});
document.addEventListener('keydown',()=>globalThis.forbidden.push('keyboard'));
</script>`;

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof ReadError && error.code === code);
}

test('módulos y archivos mediante DOM aislado sin operaciones de escritura', async t => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: new URL(route.request().url()).pathname === '/' ? manager : editor }));
  const reader = new ModuleReader(() => context.pages());
  let page: Page;
  const reset = async () => {
    for (const old of context.pages()) await old.close();
    const shell = await context.newPage(); await shell.goto('https://ide.ipf.edu.ar/');
    page = await context.newPage(); await page.goto('https://ide.ipf.edu.ar/ideFlex/');
  };
  const state = () => page.evaluate(() => ({ opened: (globalThis as any).opened, forbidden: (globalThis as any).forbidden }));
  try {
    await t.test('lista módulos y estructura real sin abrir archivos', async () => {
      await reset();
      assert.deepEqual((await reader.listModules('Fixture')).modules, [{ name: 'demo', path: 'modulos/demo' }]);
      const result = await reader.listModuleFiles('Fixture', 'demo');
      assert.deepEqual(result.entries.filter(e => e.kind === 'folder').map(e => e.area), ['php', 'templates']);
      assert.equal(result.entries.filter(e => e.kind === 'file').length, 4);
      assert.deepEqual(await state(), { opened: [], forbidden: [] });
    });
    await t.test('lee buffer completo, Unicode y espacios sin usar el viewport', async () => {
      await reset();
      for (const [id, file] of Object.entries(contents)) {
        const path = `modulos/demo/${Number(id) < 14 ? 'php' : 'templates'}/${file.name}`;
        const result = await reader.readFile('Fixture', path);
        assert.equal(result.content, file.content);
        assert.equal(result.sha256, createHash('sha256').update(file.content).digest('hex'));
        assert.equal(result.characters, file.content.length);
      }
      assert.deepEqual((await state()).forbidden, []);
      await reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php');
      assert.equal((await state()).opened.length, 4, 'reutiliza pestaña sin recargar archivo');
    });
    await t.test('resumen con cuatro archivos y tabla candidata; faltantes explícitos', async () => {
      await reset();
      const result = await reader.getModuleSummary('Fixture', 'demo');
      assert.equal(result.files.length, 4); assert.equal(result.partial, false);
      assert.deepEqual(result.table.candidates, ['demo_table']);
      await page.locator('#sourceDirectory li[id="16"]').evaluate(e => e.remove());
      const partial = await reader.getModuleSummary('Fixture', 'demo');
      assert.equal(partial.partial, true); assert.deepEqual(partial.missing, ['modulos/demo/templates/ver_form.html']);
      assert.deepEqual((await state()).forbidden, []);
    });
    await t.test('espera contenido demorado después de aparecer el panel', async () => {
      await reset();
      await page.evaluate(() => {
        const observer = new MutationObserver(records => {
          for (const record of records) for (const node of record.addedNodes) {
            if (!(node instanceof HTMLElement) || !node.matches('section.contentSystem')) continue;
            const table = node.querySelector('table');
            if (table) { table.remove(); setTimeout(() => node.append(table), 150); }
          }
        });
        observer.observe(document.querySelector('#files_content')!, { childList: true });
      });
      const result = await reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php');
      assert.equal(result.content, contents['12']!.content);
    });
    await t.test('lee también archivos ubicados directamente dentro del módulo', async () => {
      await reset();
      await page.locator('#sourceDirectory li[id="12"]').evaluate(e => document.querySelector('#sourceDirectory li[id="10"] > ul')!.append(e));
      assert.equal((await reader.readFile('Fixture', 'modulos/demo/ver_demo.php')).content, contents['12']!.content);
    });
    await t.test('resumen sin archivos convencionales devuelve error y no abre otros', async () => {
      await reset();
      await page.locator('#sourceDirectory li:not([id="root"]) > span > a.flextree-title').evaluateAll(es => {
        for (const e of es) if (/\.(php|html)$/.test(e.textContent ?? '')) e.textContent = 'aux_' + e.textContent;
      });
      await expectCode(reader.getModuleSummary('Fixture', 'demo'), 'NO_SUMMARY_FILES');
      assert.deepEqual(await state(), { opened: [], forbidden: [] });
    });
    await t.test('rechaza módulo/archivo inexistente y traversal sin abrir archivos', async () => {
      await reset();
      await expectCode(reader.listModuleFiles('Fixture', 'absent'), 'MODULE_NOT_FOUND');
      await expectCode(reader.readFile('Fixture', 'modulos/demo/php/absent.php'), 'FILE_NOT_FOUND');
      for (const path of ['../secret', '/modulos/demo/php/a.php', 'modulos/demo/../secret.php', 'modulos/demo/php/%2e%2e', 'modulos/demo/php/a\\b.php']) {
        await expectCode(reader.readFile('Fixture', path), 'INVALID_PATH');
      }
      assert.deepEqual(await state(), { opened: [], forbidden: [] });
    });
    await t.test('nombres de módulo duplicados fallan', async () => {
      await reset();
      await page.locator('#sourceDirectory li[id="10"]').evaluate(e => { const duplicate = e.cloneNode(true) as HTMLElement; duplicate.id = '100'; e.parentElement!.append(duplicate); });
      await expectCode(reader.listModules('Fixture'), 'UI_MISMATCH');
    });
    await t.test('rechaza cambios pendientes sin recargar ni guardarlos', async () => {
      await reset();
      await reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php');
      await page.locator('.CodeMirror').evaluate(e => { (e as any).CodeMirror.isClean = () => false; });
      await expectCode(reader.readFile('Fixture', 'modulos/demo/php/ver_demo_abm.php'), 'UNSAVED_EDITOR');
      assert.deepEqual(await state(), { opened: ['12'], forbidden: [] });
    });
    await t.test('rechaza editor desbloqueado y buffers inconsistentes', async () => {
      await reset();
      await reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php');
      await page.locator('.CodeMirror').evaluate(e => { (e as any).CodeMirror.getOption = () => false; });
      await expectCode(reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php'), 'EDITOR_NOT_READ_ONLY');
      await reset();
      await reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php');
      await page.locator('.CodeMirror').evaluate(e => { (e as any).CodeMirror.getValue = () => 'different'; });
      await expectCode(reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php'), 'UI_MISMATCH');
    });
    await t.test('no confunde pestaña/panel con el archivo solicitado', async () => {
      await reset();
      await reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php');
      await page.locator('#showSys12').evaluate(e => e.setAttribute('title', 'wrong.php'));
      await expectCode(reader.readFile('Fixture', 'modulos/demo/php/ver_demo.php'), 'UI_MISMATCH');
      assert.deepEqual((await state()).forbidden, []);
    });
  } finally { await context.close(); await browser.close(); }
});
