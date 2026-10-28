import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BrowserSession } from './browser.js';
import { FlexReader, ReadError } from './flex-reader.js';

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export function createServer(session: BrowserSession) {
  const server = new McpServer({ name: 'mcp-flex', version: '0.1.0' });
  const reader = new FlexReader(() => session.pages());
  const read = async (operation: () => Promise<unknown>) => {
    try { return result(await operation()); }
    catch (error) {
      return { ...result({
        error: error instanceof ReadError ? error.code : 'UI_UNAVAILABLE',
        message: error instanceof ReadError ? error.message : 'No se pudo verificar la interfaz. No se continuó ni se intentó iniciar sesión.',
      }), isError: true };
    }
  };
  server.registerTool('flex_open_browser', {
    description: 'Abre Chromium con un perfil local reutilizable. Navega solo a una URL proporcionada o configurada. No inicia sesión ni opera FlexIDE.',
    inputSchema: { url: z.string().url().optional() },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async ({ url }) => {
    try { return result(await session.open(url)); }
    catch {
      return { ...result({ error: 'No se pudo abrir o navegar. Verificá la URL HTTP(S) sin credenciales, la instalación de Chromium y que el perfil no esté en uso.' }), isError: true };
    }
  });
  server.registerTool('flex_check_session', {
    description: 'Reconoce señales del DOM autenticado del gestor FlexIDE, sin navegar ni leer cookies. No confirma la vigencia de la sesión en el servidor; devuelve unknown si falta evidencia.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => read(() => reader.checkSession()));
  server.registerTool('flex_list_sources', {
    description: 'Lee la página filtrada actual de la grilla de Fuentes ya consultada. Requiere gestor autenticado y Buscar Fuentes ejecutado manualmente; no navega ni cambia filtros o paginación.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => read(() => reader.listSources()));
  const databaseInput = {
    sourceAlias: z.string().min(1).max(200).describe('Alias exacto mostrado por flex_list_sources; su editor debe estar abierto.'),
    database: z.string().regex(/^[A-Za-z0-9_]+$/).max(128).describe('Nombre exacto del nodo de base, sin el sufijo PROD/DESA. Nunca se elige un entorno automáticamente.'),
  };
  server.registerTool('flex_list_tables', {
    description: 'Lista las tablas del árbol Base de Datos en un editor ya abierto de la fuente indicada. Solo despliega el panel y nodos de consulta; no inicia desarrollo ni consulta registros.',
    inputSchema: databaseInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ sourceAlias, database }) => read(() => reader.listTables(sourceAlias, database)));
  server.registerTool('flex_describe_table', {
    description: 'Lee nombres y tipos básicos de campos desplegando una tabla existente en el árbol del editor. No infiere claves, longitudes ni nulabilidad; no abre ni modifica archivos.',
    inputSchema: { ...databaseInput, table: z.string().regex(/^[A-Za-z0-9_]+$/).max(128) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ sourceAlias, database, table }) => read(() => reader.describeTable(sourceAlias, database, table)));
  return server;
}
