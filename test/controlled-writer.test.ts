import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ControlledWriter, type WriteApproval } from '../src/controlled-writer.js';
import { ReadError } from '../src/flex-reader.js';
import { contentHash } from '../src/file-diff.js';
import { createServer } from '../src/server.js';
import { BrowserSession } from '../src/browser.js';
import { loadConfig } from '../src/config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const approval: WriteApproval = { sourceAlias: 'Fixture', path: 'modulos/demo/templates/ver_grid.html',
  originalContent: '<script>original();</script>\n', proposedContent: '<!-- approved -->\n<script>original();</script>\n' };
const shell = '<meta charset="utf-8"><a id="userName">fixture</a><a id="close_session" href="logoutAccount">Cerrar Sesión</a><a id="7" class="openSys">Fuentes</a>';
const html = `<!doctype html><meta charset="utf-8"><body class="ondevelope">
<div id="notification_login"><strong>Fuente Fixture</strong></div>
<div id="tree_ide_db"><ul class="flextree-container"><li id="root"><span class="flextree-node"><a class="flextree-title">Bases de Datos</a></span></li></ul></div>
<div id="sourceDirectory"><ul class="flextree-container"><li id="root"><span class="flextree-node flextree-folder"><a class="flextree-title">modulos</a></span><ul>
<li id="10"><span class="flextree-node flextree-folder"><a class="flextree-title">demo</a></span><ul>
<li id="11"><span class="flextree-node flextree-folder"><a class="flextree-title">templates</a></span><ul>
<li id="12"><span class="flextree-node"><span class="flextree-connector"></span><img alt=""><a class="flextree-title">ver_grid.html</a></span></li>
</ul></li></ul></li></ul></li></ul></div><section id="files_content"><ul id="crumbs"></ul></section>
<script>
globalThis.editor={};globalThis.phaseLog=[];
function mount(content){
 const panel=document.createElement('section');panel.id='contentSystem_12';panel.className='contentSystem';
 panel.innerHTML='<table id="table_ide_edit_12"><tbody><tr><td><form><textarea id="code_12" name="code_12"></textarea><div class="CodeMirror"></div><a class="codemirror-ui-button block" original-title="Tomar (Ctrl+E)">Tomar</a><a class="codemirror-ui-button save inactive" original-title="Guardar (Ctrl+S)">Guardar</a></form></td></tr></tbody></table>';
 document.querySelector('#files_content').append(panel);
 const area=panel.querySelector('textarea');area.value=content;
 const cmEl=panel.querySelector('.CodeMirror');cmEl.textContent='viewport';
 let value=content,clean=true;const own=globalThis.owned===true;
 const cm={getValue:()=>value,getOption:()=>!own,isClean:()=>clean,getTextArea:()=>area,
  setValue(next){value=next;clean=false;editor['12'].options.saved=false;document.querySelector('#showSys12').classList.add('unsaved');panel.querySelector('.save').classList.remove('inactive');}};
 cmEl.CodeMirror=cm;editor['12']={mirror:cm,options:{saved:true,blocked:own?'blockedByMe':'noBlocked'}};
 const li=document.createElement('li');li.className='active';li.innerHTML='<a id="showSys12" rel="contentSystem_12" title="ver_grid.html">ver_grid.html</a><a id="closeMod_12" rel="contentSystem_12" title="Cerrar archivo">Cerrar</a>';document.querySelector('#crumbs').append(li);
 panel.querySelector('.block').onclick=async()=>{const r=await fetch('/ideFlex/modulos/init/php/block.php',{method:'POST',body:new URLSearchParams({id:'12'})});const d=new DOMParser().parseFromString(await r.text(),'application/xml');if(d.querySelector('resultid').textContent==='12'){globalThis.owned=true;cm.getOption=()=>false;editor['12'].options.blocked='blockedByMe';panel.querySelector('.block').classList.add('inactive');}};
 panel.querySelector('.save').onclick=async()=>{const r=await fetch('/ideFlex/modulos/init/php/save.php',{method:'POST',body:new URLSearchParams({id:'12',value:cm.getValue()})});const d=new DOMParser().parseFromString(await r.text(),'application/xml');if(d.querySelector('resultid')?.textContent==='12'){editor['12'].options.saved=true;document.querySelector('#showSys12').classList.remove('unsaved');panel.querySelector('.save').classList.add('inactive');}};
 li.querySelector('#closeMod_12').onclick=()=>{if(editor['12'].options.saved){panel.remove();li.remove();}};
}
document.querySelector('#sourceDirectory li[id="12"] a').onclick=async()=>{const r=await fetch('/ideFlex/modulos/init/php/file.php',{method:'POST',body:new URLSearchParams({id:'12'})});mount((await r.json()).content);};
mount(${JSON.stringify(approval.originalContent).replaceAll('<', '\\u003c')});
</script>`;

async function code(promise: Promise<unknown>, expected: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof ReadError && error.code === expected);
}

test('sin autorización o con ruta fuera del alcance no consulta el navegador', async () => {
  const forbidden = () => { throw new Error('Browser must not be consulted'); };
  const writer = new ControlledWriter(forbidden);
  await code(writer.unlockFile('Fixture', approval.path), 'WRITE_APPROVAL_REQUIRED');
  await code(writer.writeFile('Fixture', approval.path, approval.proposedContent), 'WRITE_APPROVAL_REQUIRED');
  await code(writer.saveFile('Fixture', approval.path), 'WRITE_APPROVAL_REQUIRED');
  const approved = new ControlledWriter(forbidden, approval);
  await code(approved.unlockFile('Fixture', 'modulos/other/templates/ver_grid.html'), 'WRITE_SCOPE_MISMATCH');
  await code(approved.unlockFile('Fixture', '../escape'), 'INVALID_PATH');
});

test('ciclo controlado con UI/HTTP aislados, backup y verificación desde servidor', async t => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'mcp-flex-writer-'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let persisted = approval.originalContent;
  let mode = 'success';
  let writes: { path: string; value: string | null }[] = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: path === '/' ? shell : html });
    const params = new URLSearchParams(request.postData() ?? '');
    assert.equal(params.get('id'), '12');
    if (path.endsWith('/file.php')) return route.fulfill({ json: { content: persisted } });
    assert(['/ideFlex/modulos/init/php/block.php', '/ideFlex/modulos/init/php/save.php'].includes(path), 'no sync ni otro endpoint');
    writes.push({ path, value: params.get('value') });
    const save = path.endsWith('/save.php');
    if (save && mode === 'error') return route.fulfill({ contentType: 'application/xml', body: '<result><resultid>error</resultid><resulttext>No guardado</resulttext></result>' });
    if (save) persisted = mode === 'wrong-content' ? 'wrong persisted content' : params.get('value')!;
    return route.fulfill({ contentType: 'application/xml', body: `<result><resultid>${save && mode === 'wrong-id' ? '99' : '12'}</resultid><resulttext>${save ? 'Archivo guardado correctamente.' : 'El archivo se bloqueo correctamente'}</resulttext></result>` });
  });
  let page: Page;
  const reset = async () => {
    for (const old of context.pages()) await old.close();
    persisted = approval.originalContent; mode = 'success'; writes = [];
    const manager = await context.newPage(); await manager.goto('https://ide.ipf.edu.ar/');
    page = await context.newPage(); await page.goto('https://ide.ipf.edu.ar/ideFlex/');
    return new ControlledWriter(() => context.pages(), approval, backupRoot);
  };
  try {
    await t.test('unlock, write sin autosave, save, restore y aprobación consumida', async () => {
      const writer = await reset();
      assert.equal((await writer.unlockFile('Fixture', approval.path)).editable, true);
      await code(writer.writeFile('Fixture', approval.path, 'unapproved'), 'CONTENT_NOT_APPROVED');
      const written = await writer.writeFile('Fixture', approval.path, approval.proposedContent);
      assert.equal(written.saved, false);
      assert.equal(writes.length, 1, 'escribir no guarda ni sincroniza');
      assert.equal(persisted, approval.originalContent);
      const backup = JSON.parse(await readFile(written.backupPath!, 'utf8'));
      assert.equal(backup.originalContent, approval.originalContent);
      await code(writer.writeFile('Fixture', approval.path, approval.proposedContent), 'WRITE_PHASE_MISMATCH');
      const saved = await writer.saveFile('Fixture', approval.path);
      assert.equal(saved.persistenceVerified, true); assert.equal(persisted, approval.proposedContent);
      const restored = await writer.writeFile('Fixture', approval.path, approval.originalContent);
      assert.equal(restored.backupPath, written.backupPath);
      const final = await writer.saveFile('Fixture', approval.path);
      assert.equal(final.restored, true); assert.equal(final.approvalConsumed, true);
      assert.equal(final.sha256, contentHash(approval.originalContent));
      assert.equal(persisted, approval.originalContent);
      assert.equal(writes.filter(r => r.path.endsWith('/save.php')).length, 2);
      await code(writer.unlockFile('Fixture', approval.path), 'WRITE_APPROVAL_CONSUMED');
      await code(writer.writeFile('Fixture', approval.path, approval.proposedContent), 'WRITE_APPROVAL_CONSUMED');
    });
    await t.test('no toma archivo con bloqueo ajeno, contenido cambiado o desarrollo detenido', async () => {
      for (const condition of ['third', 'changed', 'stopped']) {
        const writer = await reset();
        await page.evaluate(condition => {
          if (condition === 'third') (globalThis as any).editor['12'].options.blocked = 'blockedByThird';
          if (condition === 'changed') (globalThis as any).editor['12'].mirror.getValue = () => 'changed';
          if (condition === 'stopped') document.body.classList.remove('ondevelope');
        }, condition);
        await code(writer.unlockFile('Fixture', approval.path), condition === 'stopped' ? 'DEVELOPMENT_REQUIRED' : 'WRITE_PRECONDITION');
        assert.deepEqual(writes, []);
      }
    });
    await t.test('error o ID ajeno impide declarar éxito y bloquea reintentos', async () => {
      for (const failure of ['error', 'wrong-id']) {
        const writer = await reset();
        await writer.unlockFile('Fixture', approval.path);
        await writer.writeFile('Fixture', approval.path, approval.proposedContent);
        mode = failure;
        await code(writer.saveFile('Fixture', approval.path), 'WRITE_NOT_CONFIRMED');
        await code(writer.saveFile('Fixture', approval.path), 'WRITE_RESULT_UNCERTAIN');
        assert.equal(writes.filter(r => r.path.endsWith('/save.php')).length, 1);
      }
    });
    await t.test('200 y éxito XML no bastan si la reapertura devuelve contenido distinto', async () => {
      const writer = await reset();
      await writer.unlockFile('Fixture', approval.path);
      await writer.writeFile('Fixture', approval.path, approval.proposedContent);
      mode = 'wrong-content';
      await code(writer.saveFile('Fixture', approval.path), 'PERSISTENCE_NOT_VERIFIED');
    });
    await t.test('herramientas MCP ejecutan el ciclo local y conservan Sync bloqueado', async () => {
      await reset();
      const session = new BrowserSession(loadConfig({}));
      session.pages = () => context.pages();
      const server = createServer(session, { writeApproval: approval, backupRoot });
      const client = new Client({ name: 'controlled-fixture', version: '1' });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await server.connect(a); await client.connect(b);
      try {
        for (const [name, content] of [
          ['flex_unlock_file', undefined], ['flex_write_file', approval.proposedContent], ['flex_save_file', undefined],
          ['flex_write_file', approval.originalContent], ['flex_save_file', undefined],
        ] as const) {
          const result = await client.callTool({ name, arguments: { sourceAlias: approval.sourceAlias, path: approval.path, ...(content === undefined ? {} : { content }) } });
          assert(!result.isError, JSON.stringify(result));
        }
        const sync = await client.callTool({ name: 'flex_sync_file', arguments: { sourceAlias: approval.sourceAlias, path: approval.path } });
        assert.equal(sync.isError, true);
        assert.match(JSON.stringify(sync), /WRITE_APPROVAL_REQUIRED/);
        assert.equal(persisted, approval.originalContent);
        assert(writes.every(r => !r.path.includes('sync')));
      } finally { await client.close(); await server.close(); }
    });
  } finally {
    await context.close(); await browser.close();
    assert(resolve(backupRoot).startsWith(resolve(tmpdir()) + '\\mcp-flex-writer-') || resolve(backupRoot).startsWith(resolve(tmpdir()) + '/mcp-flex-writer-'));
    await rm(backupRoot, { recursive: true, force: true });
  }
});
