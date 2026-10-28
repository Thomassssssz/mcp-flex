import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as httpServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BrowserSession } from '../src/browser.js';
import { createServer } from '../src/server.js';
import { loadConfig, validateUrl } from '../src/config.js';

test('configuración y rechazo de URLs inseguras', () => {
  assert.equal(loadConfig({}).headless, false);
  assert.throws(() => loadConfig({ FLEX_HEADLESS: 'yes' }));
  for (const url of ['file:///tmp/a', 'javascript:alert(1)', 'https://user:password@example.org']) {
    assert.throws(() => validateUrl(url));
  }
});

test('protocolo MCP: listado, consulta sin navegador y error de URL', async () => {
  const session = new BrowserSession(loadConfig({}));
  const server = createServer(session);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a); await client.connect(b);
    assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ['flex_check_session', 'flex_describe_table', 'flex_get_module_summary', 'flex_list_module_files', 'flex_list_modules', 'flex_list_sources', 'flex_list_tables', 'flex_open_browser', 'flex_read_file']);
    const response = await client.callTool({ name: 'flex_check_session', arguments: {} });
    assert.match(JSON.stringify(response), /unknown/);
    assert.equal(session.check().browserOpen, false);
    for (const name of ['flex_list_sources', 'flex_list_tables', 'flex_describe_table']) {
      const response = await client.callTool({ name, arguments: name === 'flex_list_sources' ? {} : {
        sourceAlias: 'Fixture', database: 'fixture_db', ...(name === 'flex_describe_table' ? { table: 'fixture_table' } : {}),
      } });
      assert.equal(response.isError, true);
      assert.match(JSON.stringify(response), /SESSION_UNVERIFIED/);
    }
    for (const name of ['flex_list_modules', 'flex_list_module_files', 'flex_read_file', 'flex_get_module_summary']) {
      const response = await client.callTool({ name, arguments: {
        sourceAlias: 'Fixture', ...(name === 'flex_read_file' ? { path: 'modulos/demo/php/ver_demo.php' } : name === 'flex_list_modules' ? {} : { module: 'demo' }),
      } });
      assert.equal(response.isError, true);
      assert.match(JSON.stringify(response), /SESSION_UNVERIFIED/);
    }
    const error = await client.callTool({ name: 'flex_open_browser', arguments: { url: 'file:///tmp/a' } });
    assert.equal(error.isError, true);
    assert.equal(session.check().browserOpen, false);
  } finally { await client.close(); await server.close(); await session.close(); }
});

test('Chromium real: apertura concurrente, persistencia y cierre contra sitio local', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'mcp-flex-test-'));
  const site = httpServer((_req, res) => {
    res.setHeader('Set-Cookie', 'test_session=local; Max-Age=3600; HttpOnly; SameSite=Lax');
    res.end('<!doctype html><title>Local test</title>Local fixture');
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const address = site.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = new BrowserSession({ profileDir, headless: true, url: undefined });
  try {
    await Promise.all([session.open(url), session.open()]);
    assert.equal(session.check().browserOpen, true);
    assert.equal(session.check().authentication, 'unknown');
    await session.close();
    assert.equal(session.check().browserOpen, false);
    // Reabrir el perfil y verificar la cookie desde Playwright, nunca desde la herramienta MCP.
    const { chromium } = await import('playwright');
    const context = await chromium.launchPersistentContext(profileDir, { headless: true });
    try { assert((await context.cookies(url)).some(c => c.name === 'test_session')); }
    finally { await context.close(); }
  } finally {
    await session.close();
    await new Promise<void>((resolve, reject) => site.close(e => e ? reject(e) : resolve()));
    await rm(profileDir, { recursive: true, force: true });
  }
});

test('servidor compilado funciona por stdio', async () => {
  const client = new Client({ name: 'stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'] });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 9);
    const response = await client.callTool({ name: 'flex_check_session', arguments: {} });
    assert.match(JSON.stringify(response), /unknown/);
  } finally { await client.close(); }
});
