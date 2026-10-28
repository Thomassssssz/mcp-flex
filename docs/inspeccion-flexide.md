# Inspección real de FlexIDE — 2026-10-28

## Alcance

Sitio inspeccionado con Playwright: `https://ide.ipf.edu.ar/`. El usuario inició sesión manualmente en Chromium con el perfil persistente del proyecto. No se ingresaron credenciales desde código. No se exportaron cookies, tokens, HAR, trazas ni cuerpos de requests/responses. La observación de red conservó únicamente método, origen filtrado, pathname sin query y tipo de recurso en memoria.

Acciones realizadas: desplegar Interfaz, abrir Fuentes, pulsar Buscar Fuentes sin completar filtros, abrir el editor mediante el engranaje de una fila, desplegar Base de Datos, bases, Tablas y campos. No se pulsó Iniciar desarrollo, no se abrieron archivos de código, no se hicieron cambios ni sincronizaciones, ni se reprodujeron endpoints internos con fetch/APIRequestContext.

Se inspeccionaron páginas, frames, textos, etiquetas, clases, IDs, `href`, `original-title`, `name` y `aria-expanded`. En ambas páginas solo se observó el frame principal: no había iframes. No se presupone que otras versiones carezcan de ellos: esta implementación no busca dentro de frames desconocidos.

## Identidad y autenticación

En el gestor, la combinación observada fue:

| Evidencia | Selector / atributo observado |
| --- | --- |
| Menú de usuario con texto no vacío | `a#userName` |
| Cerrar Sesión | `a#close_session[href="logoutAccount"]`, texto `Cerrar Sesión` |
| Menú Fuentes | `a[id="7"].openSys`, texto `Fuentes` |

`flex_check_session` exige esa combinación en una página del origen exacto y pathname `/`, y rechaza señales contradictorias, incluyendo un input password visible. No devuelve el nombre del usuario. Si falta evidencia devuelve `authentication: "unknown"`. No se implementó `unauthenticated` porque no se inspeccionó la pantalla de login antes de autenticar.

`authenticated` significa que se reconoció el DOM del gestor autenticado; no es una comprobación de vigencia en el servidor. Una página abierta puede quedar desactualizada si la sesión vence. Las lecturas representan la interfaz cargada, no prometen datos actualizados de la base. No se fuerza una recarga ni se llama a un endpoint para comprobarlo. Un editor abierto sin el gestor reconocible no alcanza para habilitar las lecturas.

## Fuentes

La opción Fuentes estaba dentro del menú Interfaz (`a.hasUl`, con texto Interfaz). Se desplegó Interfaz y se pulsó `a[id="7"]`. La vista se insertó en `#contentSystem_7`, sin cambiar la URL del gestor.

| Elemento | Evidencia DOM |
| --- | --- |
| Formulario de filtros | `form[id="searchAdvance_grid_fuentes_solo_id_devsoem01"]` |
| Buscar Fuentes | `button.save`, texto exacto `Buscar Fuentes` |
| Grilla | `#contentSystem_7 table[id="grid_fuentes_solo_id_devsoem01"]` |
| Contenedor de grilla | `#contentSystem_7 div.flex.flexGrid` |
| Filas | hijos `tbody > tr` de la grilla |
| Identidad | ID del `tr` y celda `td[name="id_devsoem01"]` coincidentes |
| Alias | `td[name="devsoem01_alias"]` |
| Nombre | `td[name="devsoem01_nombre"]`, oculto visualmente pero presente |
| Base PROD | `td[name="devsoem01_bd_prod"]` |
| Editor | en celda alias, `span.ActionsLink[original-title="Interfaz de desarrollo \| Id: 189"]` para la fila observada |
| Paginación | `.pDiv .pcontrol input`, `.totalPage`, `.statTotal` dentro del contenedor de grilla |

El botón Buscar Fuentes está fuera del elemento `form`; el selector limitado al formulario no encontró el botón. La pulsación se verificó con el selector CSS y su texto, sin forzar clics.

En la sesión se observó una fila: ID `189`, alias y nombre `Grupo-2026-11`, base PROD `grupo_2026_11`. Esos valores se documentan como evidencia y ejemplos; no están fijados en la lógica. El engranaje abrió una pestaña en `https://ide.ipf.edu.ar/ideFlex/`.

`flex_list_sources` lee la grilla ya consultada. No abre la vista, no ejecuta búsquedas ni cambia filtros o página. Devuelve `scope: "current_filtered_page"`, paginación y `complete` para esa consulta. Incluso si `complete` es true puede haber filtros activos. Una grilla sin filas verificables o sin paginación consultada produce error: todavía no se observó una respuesta real sin resultados y no se inventó su estructura.

## Editor y árbol de módulos

El editor observado tenía título con el formato `src: <alias> | usr: <usuario>`. Para elegir la fuente se usan los nodos de texto directos de `#notification_login > strong`, que contenían `Fuente Grupo-2026-11`; no se usa el nombre de usuario.

Árbol de archivos: `#sourceDirectory > ul.flextree-container > li[id="root"]`. Su título directo `span > a.flextree-title` era `modulos`. No se desplegaron módulos ni se abrió código. El botón `a.startDevelopment` permaneció sin pulsar.

Hay IDs `root` repetidos entre árboles. Nunca se usa `#root` sin acotar al contenedor correspondiente.

## Base de Datos, tablas y campos

Panel: `h3[role="tab"]` con texto exacto `Base de Datos`. Su `aria-expanded` cambiaba de `false` a `true`. Contenedor: `#tree_ide_db`.

| Nivel | Selector observado, acotado al padre |
| --- | --- |
| Raíz BD | `#tree_ide_db > ul.flextree-container > li[id="root"]` |
| Bases | raíz BD `> ul > li` |
| Base concreta | raíz BD `> ul > li[id="<database>"]` |
| Categoría Tablas | base `> ul > li[id="tables"]`, título `Tablas` |
| Tablas | categoría `> ul > li` con ID y título coincidentes |
| Campos | tabla `> ul > li` con ID de campo y título `nombre (tipo)` |
| Nodo | hijo directo `span.flextree-node` |
| Expansor de consulta | hijo directo del nodo `span.flextree-expander` |
| Estado expandido | clase `flextree-expanded` en el nodo |
| Título directo | nodo `> a.flextree-title` |

Bases observadas: `grupo_2026_11` con etiqueta `grupo_2026_11 - PROD`, y `desa_grupo_2026_11` con etiqueta `desa_grupo_2026_11 - DESA`. Los nombres se leen del DOM; no se derivan por convención. Se desplegaron ambos nodos de base; el inventario de tablas y los campos se verificaron en PROD. La categoría `tables` puede repetirse entre bases; siempre se acota al nodo elegido.

En PROD se listaron 50 tablas, incluyendo tablas de la aplicación `cit_inve_*` y del framework `flx_core_*`. No se leyeron registros. Se verificaron los campos de:

- `cit_inve_01_cab_categorias`: `id_citinve01 (int)`, `citinve01_nombre (varchar)`, `citinve01_descripcion (varchar)`, `citinve01_estado (varchar)`, `rela_citinve03 (int)`, `rela_citinve04 (int)`.
- `cit_inve_02_cab_unidades`: `id_citinve02 (int)`, `citinve02_nombres (varchar)`, `citinve02_abreviatura (varchar)`, `citinve02_estado (varchar)`.

`flex_describe_table` devuelve solo nombres y tipos básicos. No hay evidencia suficiente en este árbol para informar longitudes, claves primarias/foráneas, índices, nulabilidad, valores predeterminados o relaciones a partir del prefijo de un campo.

## Red observada

Estos son pathnames reales, no contratos de API autorizados para reproducir. No se almacenaron parámetros ni bodies. Los POST de carga se observaron como consecuencia de pulsaciones en la interfaz.

| Método | Pathname | Momento de observación |
| --- | --- | --- |
| POST | `/modulos/fuentes/php/ver_fuentes.php` | Abrir Fuentes |
| POST | `/lib/flex/flexComboXml.php` | Carga de combos de filtros |
| POST | `/lib/flex/flexGridXml.php` | Buscar Fuentes |
| GET | `/ideFlex` y `/ideFlex/` | Abrir editor desde engranaje |
| POST | `/ideFlex/modulos/init/php/log.php` | Carga automática del editor; propósito y efecto no verificados |
| POST | `/ideFlex/modulos/init/php/getDirectoryTree.php` | Carga automática del árbol de archivos |
| POST | `/lib/flex/flexTreeXml.php` | Carga automática de árboles |
| POST | `/ideFlex/modulos/db/php/getTreeDbJson.php` | Carga del árbol BD |
| POST | `/ideFlex/modulos/init/php/home_advance.php` | Inicio del editor |
| POST | `/ideFlex/modulos/db/php/getFieldsDbJson.php` | Desplegar campos de tabla |

La aplicación realiza una llamada automática a `log.php` al abrir el editor. No se reprodujo ni se inspeccionó su body, y no se afirma que la navegación no genere registros internos. Ninguna herramienta implementada abre el editor o pulsa Iniciar desarrollo.

## Herramientas y uso

1. Abrir el navegador desde el servidor MCP con `flex_open_browser` y la URL real. Iniciar sesión manualmente si hace falta.
2. Mantener el gestor abierto. Entrar en Interfaz → Fuentes y pulsar Buscar Fuentes manualmente.
3. Llamar `flex_check_session` y `flex_list_sources`.
4. Abrir manualmente el editor usando el engranaje del alias. Mantener un único editor por alias.
5. Llamar las lecturas con base explícita. Si no existe, el error incluye los nodos de base disponibles.

Ejemplos de argumentos, basados en la sesión inspeccionada:

```json
{"sourceAlias":"Grupo-2026-11","database":"grupo_2026_11"}
```

Para `flex_describe_table`:

```json
{"sourceAlias":"Grupo-2026-11","database":"grupo_2026_11","table":"cit_inve_02_cab_unidades"}
```

Las lecturas de BD solo despliegan el panel y nodos de consulta cuando están colapsados. Se serializan dentro de cada servidor. La fuente se comprueba antes y después de leer, sin cambiarla automáticamente. No operar manualmente otra fuente mientras una lectura está en curso.

Rechazos controlados: `SESSION_UNVERIFIED`, `SOURCES_VIEW_REQUIRED`, `SOURCES_NOT_READY`, `EDITOR_REQUIRED`, `DATABASE_NOT_FOUND`, `TABLE_NOT_FOUND`, `INVALID_IDENTIFIER`, `INVALID_SOURCE`, `UI_MISMATCH` y `UI_UNAVAILABLE`. No se devuelven errores crudos de Playwright. Las estructuras vacías/no inspeccionadas o las cargas que no terminan fallan de manera conservadora.

## Validación

- Compilación TypeScript y comprobación de tipos.
- Herramientas llamadas mediante MCP en memoria sobre el contexto real existente: sesión reconocida, una fuente, 50 tablas y cuatro campos de unidades.
- Pruebas con Chromium y fixtures sintéticas aisladas: origen, señales de sesión, columnas faltantes, IDs inconsistentes, paginación parcial, duplicados, nombres de selector inválidos, fuente equivocada, bases PROD/DESA con IDs repetidos y campos alterados. No usan el perfil del usuario ni alcanzan el servidor real.
- Pruebas previas de persistencia, cierre del contexto y protocolo por stdio conservadas.
