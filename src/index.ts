import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BrowserSession } from './browser.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

const session = new BrowserSession(loadConfig());
const server = createServer(session);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await session.close();
  await server.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
process.stdin.once('end', () => { void shutdown(); });
try { await server.connect(new StdioServerTransport()); }
catch {
  console.error('No se pudo iniciar el servidor MCP.');
  await shutdown();
  process.exitCode = 1;
}
