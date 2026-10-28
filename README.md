# mcp-flex

Base incremental de un servidor MCP para FlexIDE con Node.js, TypeScript y Playwright. Requiere Node.js 22 o superior. Transporte: stdio; stdout queda reservado al protocolo MCP.

## Preparación

```powershell
npm ci
npm run browser:install
npm run build
npm test
```

```powershell
npm start
```

El servidor espera un cliente MCP por stdin. También se puede desarrollar con `npm run dev` y comprobar tipos con `npm run check`. Las pruebas requieren haber compilado antes.

## Conectar un cliente MCP

Ejemplo de configuración (adaptar la ruta si se mueve el proyecto):

```json
{
  "mcpServers": {
    "flex": {
      "command": "node",
      "args": ["C:/Users/ezequ/Desktop/mcp-flex/dist/index.js"],
      "env": { "FLEX_HEADLESS": "false" }
    }
  }
}
```

## Herramientas disponibles

- `flex_open_browser`: acepta `url` opcional HTTP(S), sin credenciales. Abre Chromium con un perfil persistente exclusivo; reutiliza el contexto abierto. Sin URL ni `FLEX_URL`, abre una página en blanco. No inicia sesión ni hace clic en FlexIDE. Las aperturas se serializan para evitar abrir simultáneamente el mismo perfil.
- `flex_check_session`: reconoce el DOM autenticado del gestor mediante señales verificadas en la sesión real. Devuelve `authenticated` o `unknown`; no navega, no expone cookies y no comprueba vigencia en el servidor.
- `flex_list_sources`: lee la página filtrada actual de Fuentes ya consultada manualmente; incluye ID, alias, nombre, base PROD y paginación.
- `flex_list_tables`: requiere `sourceAlias` y `database` exactos y un único editor de esa fuente ya abierto; despliega únicamente nodos de consulta del árbol Base de Datos.
- `flex_describe_table`: requiere además `table`; devuelve nombres y tipos básicos visibles, sin inferir claves, longitudes ni nulabilidad.

Mantener el gestor autenticado abierto, entrar en Interfaz → Fuentes y pulsar Buscar Fuentes manualmente. Abrir el editor con el engranaje del alias antes de consultar tablas. Ninguna lectura inicia desarrollo, cambia de fuente, crea archivos ni sincroniza. Un DOM inesperado o ambiguo genera un error controlado. Los datos son los de la interfaz cargada y pueden estar desactualizados.

Selectores, rutas observadas, limitaciones y ejemplos de argumentos: [inspección real de FlexIDE](docs/inspeccion-flexide.md).

Si falla la navegación, el navegador puede permanecer abierto para su inspección y el siguiente intento. Cerrar el navegador manualmente permite volver a abrirlo. Al terminar la conexión stdio o recibir SIGINT/SIGTERM se cierra el contexto.

## Configuración y sesión

Variables opcionales: `FLEX_URL` (URL real provista por la materia), `FLEX_HEADLESS` (`true` o `false`, por defecto `false`) y `FLEX_PROFILE_DIR`. El perfil predeterminado es `.playwright/flex-profile`, relativo a la raíz del proyecto incluso si el cliente arranca desde otro directorio. Una ruta relativa personalizada también se resuelve desde esa raíz.

Para usar `.env`, copiar `.env.example` y ejecutar `node --env-file=.env dist/index.js`. `npm start` no carga `.env` automáticamente. No guardar credenciales en esas variables. El inicio de sesión futuro será manual en el navegador visible.

El perfil contiene datos sensibles de sesión: está excluido de Git, junto con `.env`, dependencias, compilados y archivos temporales de revisión. No compartirlo ni usar el perfil habitual de Chrome. Solo un proceso debe usar cada perfil. No se exporta `storageState`, no se registran URLs ni cookies en las respuestas.

## Alcance y documentación

Se revisaron AGENTS.md, los dos PDF, el DOCX y el SQL de `docs/`. El video se inspeccionó mediante fotogramas cada 30 segundos a lo largo de sus 5:36; no se transcribió su audio ni se verificó cada fotograma. Los materiales originales se conservan sin cambios.

Los tutoriales describen fuentes, tablas, plantillas de módulo, FlexGrid en `ver_NOMBRE_MODULO.php`, FlexForm en `_abm.php`, JavaScript en `templates/ver_form.html`, `urlValidator` y `onSubmitExecute`. Guardar, sincronizar, registrar módulos y asociar perfiles son pasos distintos. El video incluye un resultado 404 al final: no demuestra que el módulo haya quedado operativo.

La consigna y SQL incluyen dos pares independientes: destinos/paquetes y tipos de traslado/traslados; exigen relaciones, validaciones, búsquedas y cálculos tanto en formulario como en servidor. Son ejemplos para etapas posteriores, no una especificación fija para todas las consignas.

Esta etapa usa selectores observados en una sesión real y permite leer el inventario de tablas y campos desde el DOM. No reproduce endpoints internos, consulta registros ni escribe archivos FlexIDE. Creación, sincronización, instalación y asociación a perfiles quedan pendientes de etapas posteriores.

Referencias técnicas utilizadas: [MCP SDK v1](https://ts.sdk.modelcontextprotocol.io/server) y [contextos persistentes de Playwright](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context).
