# Inspección real de FlexIDE — 2026-10-28

## Alcance

Sitio inspeccionado con Playwright: `https://ide.ipf.edu.ar/`. El usuario inició sesión manualmente en Chromium con el perfil persistente del proyecto. No se ingresaron credenciales desde código. No se exportaron cookies, tokens, HAR, trazas ni cuerpos de requests/responses. La observación de red conservó únicamente método, origen filtrado, pathname sin query y tipo de recurso en memoria.

Acciones de la primera etapa: desplegar Interfaz, abrir Fuentes, pulsar Buscar Fuentes sin completar filtros, abrir el editor mediante el engranaje de una fila, desplegar Base de Datos, bases, Tablas y campos. En esa etapa no se pulsó Iniciar desarrollo ni se abrieron archivos de código. La etapa posterior de lectura de archivos se documenta al final. No se hicieron cambios ni sincronizaciones, ni se reprodujeron endpoints internos con fetch/APIRequestContext.

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

Árbol de archivos: `#sourceDirectory > ul.flextree-container > li[id="root"]`. Su título directo `span > a.flextree-title` era `modulos`. En la primera etapa no se desplegaron módulos ni se abrió código. El botón `a.startDevelopment` permaneció sin pulsar en ambas etapas.

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

## Segunda etapa: módulos y archivos existentes

Se reutilizó la misma sesión de Chromium sin volver a iniciar sesión. Se inspeccionaron DOM, textos, atributos, URLs, frames y requests al desplegar el árbol y abrir archivos. El editor siguió en `/ideFlex/`, con un único frame principal. No se pulsó Iniciar desarrollo, Tomar/Liberar, Guardar, Sync, instalar módulos ni controles de perfiles.

### Selectores y comportamiento observados

| Elemento | Evidencia |
| --- | --- |
| Panel de archivos | `h3[role="tab"]`, texto exacto `Archivos - <alias>`, `aria-expanded` |
| Raíz | `#sourceDirectory > ul.flextree-container > li[id="root"]` |
| Hijos de cada carpeta | `:scope > ul > li` |
| Nombre | `:scope > span.flextree-node > a.flextree-title` |
| Carpeta | clase `flextree-folder` en el span directo |
| Archivo | span directo sin `flextree-folder`, con `span.flextree-connector` e `img` |
| Desplegar carpeta | `span.flextree-expander` directo; estado `flextree-expanded` |
| Abrir archivo | clic simple en su `a.flextree-title` directo |
| Panel del archivo | `#files_content > section[id="contentSystem_<nodeId>"]` |
| Tabla del editor | `table[id="table_ide_edit_<nodeId>"]` dentro del panel |
| Textarea original | `textarea[id="code_<nodeId>"][name="code_<nodeId>"]` |
| Editor | `.CodeMirror` único dentro de la tabla, propiedad DOM `CodeMirror` |
| Pestaña | `#crumbs a[id="showSys<nodeId>"][rel="contentSystem_<nodeId>"]`, `title` igual al nombre del archivo |
| Pestaña activa | hijo directo de `#crumbs > li.active` |

Los IDs de nodos son numéricos y no expresan rutas. Ejemplos observados: carpeta categorias `359564`, php `359565`, archivo ver_categorias.php `359566`, ABM `359567`, templates `359568`, ver_grid.html `359569`, ver_form.html `359570`. No se fijan esos números en la lógica: cada nodo se resuelve por su nombre exacto bajo su padre, y el número observado se usa para comprobar la correspondencia entre panel, pestaña, textarea e instancia de editor. Los archivos homónimos de templates no se buscan globalmente.

El primer archivo se abrió con doble clic durante la exploración; luego se verificó que un clic simple basta y esa es la acción implementada. Para archivos ya abiertos se activa su pestaña, sin volver a abrirlos desde el árbol ni recargar su buffer. La expansión del árbol no produjo nuevos requests durante esta inspección: sus hijos ya estaban disponibles para el componente.

### Contenido completo y condiciones de seguridad

La vista visible del archivo largo `ver_categorias.php` llegaba aproximadamente a la línea 48, pero la instancia contenía 123 líneas. La lectura usa exclusivamente los métodos observados de CodeMirror: `getValue()`, `getOption('readOnly')`, `isClean()`, `lineCount()` y `getTextArea()`. No usa el texto del viewport ni concatena líneas visibles.

Se exige `readOnly === true`, `isClean() === true`, textarea asociado por ID y valor coincidente, y número de líneas consistente. Se comprueban también los demás editores abiertos para no recargar archivos cuando hay cambios pendientes. Un editor desbloqueado no se bloquea automáticamente: la operación falla. No se invoca `setValue`, `save`, `setOption`, atajos de teclado ni botones de escritura.

La apertura es asíncrona: apareció un panel visible antes de que existiera `table_ide_edit_<nodeId>`. Eso produjo un rechazo conservador en la primera implementación. Se corrigió con esperas acotadas por pestaña activa, tabla visible e instancia de CodeMirror inicializada; las comprobaciones de identidad y solo lectura se conservaron. Se agregó una prueba con panel visible y contenido demorado.

`flex_read_file` devuelve ruta, contenido íntegro, cantidad de caracteres/líneas y SHA-256 del texto UTF-8 obtenido del buffer. Ese hash identifica el texto leído; no garantiza bytes originales, codificación ni finales de línea del archivo en disco. Un buffer limpio ya abierto puede estar desactualizado respecto de cambios externos: no se fuerza refresh.

Las rutas deben permanecer dentro de `modulos/<módulo>/`, con segmentos simples de letras ASCII, números, guion, guion bajo y punto interno. Se rechazan rutas absolutas, `..`, barras invertidas, porcentajes codificados y expresiones de selector. Se admiten archivos en la raíz del módulo y subcarpetas reales. Nombres con espacios o caracteres fuera de ese conjunto fallan de forma explícita; no se convierten silenciosamente.

### Herramientas nuevas

- `flex_list_modules({sourceAlias})`: devuelve nombres y rutas de las carpetas directas bajo modulos.
- `flex_list_module_files({sourceAlias,module})`: devuelve la estructura real recursiva, `kind: folder/file` y `area: php/templates/other`. Despliega carpetas sin abrir archivos. Límite conservador: 500 entradas y profundidad 12; si se supera, devuelve error, sin presentar una lista parcial como completa. Directorios vacíos/no reconocibles no se suponen vacíos.
- `flex_read_file({sourceAlias,path})`: abre o activa un archivo existente y lee el buffer completo verificado.
- `flex_get_module_summary({sourceAlias,module})`: lee los cuatro archivos convencionales que existan: `php/ver_<módulo>.php`, `php/ver_<módulo>_abm.php`, `templates/ver_grid.html` y `templates/ver_form.html`. Los nombres son candidatos de búsqueda; la existencia se comprueba antes en el árbol real.

Ejemplos:

```json
{"sourceAlias":"Grupo-2026-11","module":"items"}
```

```json
{"sourceAlias":"Grupo-2026-11","path":"modulos/items/php/ver_items_abm.php"}
```

Errores nuevos: `MODULE_NOT_FOUND`, `FILE_NOT_FOUND`, `NOT_A_DIRECTORY`, `NOT_A_FILE`, `INVALID_PATH`, `TREE_NOT_READY`, `TREE_LIMIT`, `UNSAVED_EDITOR`, `EDITOR_NOT_READ_ONLY`, `NO_SUMMARY_FILES`. DOM o IDs duplicados producen `UI_MISMATCH`; esperas agotadas producen `UI_UNAVAILABLE` en MCP. No se devuelven errores internos crudos.

Un archivo faltante solicitado mediante `flex_read_file` es un error. En el resumen, los archivos opcionales faltantes se enumeran en `missing` y se devuelve `partial: true`; si no existe ninguno de los cuatro, se devuelve `NO_SUMMARY_FILES`. Un fallo de lectura de un archivo existente aborta el resumen: no se oculta como si el archivo faltara.

### Análisis del resumen

Se extraen asignaciones PHP de `idFlex`, `title`, `sortname`, `colModel`, `searchItems`, `searchAdvanceItems`, `fields`, `urlValidator` y `onSubmitExecute`. Se informa por archivo: estado, línea, operador, expresión original, texto de la cadena y valor literal cuando puede afirmarse sin evaluación. Los bloques de configuración se devuelven como texto fuente completo, no como objetos JS ejecutados. Las plantillas informan referencias a placeholders de esas variables.

Se ignoran comentarios y variables dentro de cadenas; se conservan definiciones múltiples, por ejemplo títulos de alta/modificación dentro de condiciones. No se elige una rama ni se resuelven interpolaciones, funciones, includes, constantes o PHP/JS dinámico. Heredoc/nowdoc y cadenas/comentarios incompletos producen advertencias y detienen el análisis de ese archivo desde ese punto. Es un extractor estático limitado, no un intérprete ni un parser completo de PHP o de SQL.

La tabla se informa como candidata encontrada en strings SQL del código PHP, con archivo y línea de evidencia. No se deduce desde `idFlex`, prefijos o nombres de módulo. Si aparecen varias tablas, se mantienen todas como candidatas; si no aparece ninguna, se devuelve `unknown`. No se declara cuál es la tabla principal sin evidencia adicional.

### Inventario real verificado

Se listaron estas 12 carpetas: categorias, detalles_movimientos, items, lotes, movimientos, perfiles, proveedores, proyectos, tipos_movimiento, ubicaciones, unidades y usuarios. Enumerarlas no implica haber abierto archivos de todas.

Se inspeccionó la estructura completa de **categorias, unidades, ubicaciones, proveedores e items**. Cada una tenía `php/` y `templates/`, con seis archivos:

| Módulo | PHP auxiliares encontrados y solo listados |
| --- | --- |
| categorias | `onSubmit_categorias.php`, `validaciones.php` |
| unidades | `onSubmit_unidades.php`, `validaciones_unidades.php` |
| ubicaciones | `onSubmit_ubicaciones.php`, `validaciones_ubicaciones.php` |
| proveedores | `onSubmit_proveedores.php`, `validaciones_proveedores.php` |
| items | `onSubmit_items.php`, `validaciones_items.php` |

Se abrieron y leyeron íntegramente estos **20 archivos**. Las rutas de las dos columnas PHP son relativas a `modulos/<módulo>/php/`; las plantillas indicadas están bajo `modulos/<módulo>/templates/` en cada fila.

| Módulo | PHP de grilla (caracteres / líneas) | PHP de ABM (caracteres / líneas) | Plantillas abiertas |
| --- | --- | --- | --- |
| categorias | `ver_categorias.php` (4063 / 123) | `ver_categorias_abm.php` (3357 / 160) | `ver_grid.html`, `ver_form.html` |
| unidades | `ver_unidades.php` (4004 / 130) | `ver_unidades_abm.php` (3214 / 153) | `ver_grid.html`, `ver_form.html` |
| ubicaciones | `ver_ubicaciones.php` (4339 / 145) | `ver_ubicaciones_abm.php` (3438 / 184) | `ver_grid.html`, `ver_form.html` |
| proveedores | `ver_proveedores.php` (4671 / 157) | `ver_proveedores_abm.php` (4184 / 227) | `ver_grid.html`, `ver_form.html` |
| items | `ver_items.php` (5476 / 179) | `ver_items_abm.php` (5765 / 313) | `ver_grid.html`, `ver_form.html` |

En los cinco casos, `ver_grid.html` tenía 1005 caracteres / 40 líneas y `ver_form.html`, 682 caracteres / 24 líneas. Los cuatro archivos convencionales existían en todos esos módulos.

Candidatos SQL observados en sus ABM: `cit_inve_01_cab_categorias`, `cit_inve_02_cab_unidades`, `cit_inve_03_cab_ubicaciones`, `cit_inve_04_cab_proveedores` y `cit_inve_05_cab_items`, respectivamente. Ejemplo de evidencia concreta: categorias tiene `$idFlex="id_citinve01"`, título `Categorias`, `urlValidator="modulos/categorias/php/validaciones.php"` y `onSubmitExecute="modulos/categorias/php/onSubmit_categorias.php"`.

### Red y efectos propios de abrir archivos

Requests nuevos observados: POST a `/ideFlex/modulos/init/php/file.php` y `/ideFlex/modulos/init/php/fileResume.php` al abrir archivos; también se observó POST automático a `/ideFlex/modulos/init/php/log.php`. No se inspeccionaron bodies ni se llamaron esas rutas directamente. Los módulos se leyeron desde el editor, sin ejecutar el PHP del archivo leído.

El panel de metadatos muestra «Última Apertura» actualizada al abrir un archivo. Por tanto, una apertura puede registrar actividad interna en FlexIDE; no se promete ausencia de esos metadatos. No se guardó ni se sincronizó contenido, no se tomaron bloqueos ni se pulsaron operaciones de escritura.

### Validación de esta etapa

Las cuatro herramientas nuevas se invocaron también mediante MCP sobre la sesión real: 12 módulos, estructura de items con ocho entradas (dos carpetas y seis archivos), lectura íntegra de `ver_items.php` y resumen de sus cuatro archivos convencionales.

Las pruebas locales usan páginas interceptadas y un contrato sintético de CodeMirror: lectura completa más allá del viewport, Unicode y espacios, hash, pestañas reutilizadas sin recarga, contenido demorado, archivos en la raíz del módulo, archivos convencionales ausentes, rutas inválidas, nombres duplicados, buffers inconsistentes, editores desbloqueados y cambios pendientes. Registran cualquier pulsación de guardar/sincronizar/tomar o teclas para comprobar que no ocurren. El análisis estático tiene pruebas separadas para comentarios, interpolaciones, condiciones, concatenaciones, cadenas escapadas, heredoc y tablas desconocidas/múltiples.

Resultado final: `npm run build`, `npm run check` y las **31 pruebas** de `npm test` pasaron. Al terminar, las 20 instancias reales de CodeMirror seguían con `readOnly === true` e `isClean() === true`. Se detuvo la observación de red y se dejó Chromium abierto.

## Tercera etapa: preparación de escritura controlada (estado previo a la autorización)

**Esta sección conserva el estado de preparación anterior a la autorización.** La prueba autorizada y sus resultados se documentan en la sección siguiente. El usuario exigió mostrar propuesta, diff y restauración y detenerse antes de desbloquear/escribir/guardar/sincronizar.

### Estado de implementación

- `flex_diff_file` está implementada y comprobada mediante MCP en la sesión real. Lee primero el archivo con las mismas verificaciones de la etapa anterior; devuelve diff unificado íntegro y hashes de los dos textos. No cambia el buffer ni toma bloqueos. Un único hunk cubre todos los cambios; no se promete un diff mínimo cuando hay cambios distantes. Conserva distinción entre newline final, CRLF y LF. No escribe copias locales desde esta herramienta de solo lectura.
- `flex_unlock_file`, `flex_write_file`, `flex_save_file` y `flex_sync_file` están **registradas pero inhabilitadas**: devuelven `WRITE_APPROVAL_REQUIRED` antes de consultar el navegador. No tienen todavía implementación operativa validada. Un argumento como `approved: true` no evita la barrera. No se presenta su registro como validación de escritura.
- Se agregó `npm run typecheck`. Build, typecheck y **35 pruebas** pasaron. Las pruebas verifican diff completo, hashes, conservación del buffer, rechazo de rutas/archivos inexistentes, cambios pendientes y ausencia de acceso al navegador desde las mutaciones bloqueadas.

### Inspección sin mutaciones

Se inspeccionaron estructuras de detalles_movimientos, lotes, movimientos, proyectos y tipos_movimiento. No aparecieron carpetas/archivos explícitos de pruebas; los PHP auxiliares se llaman onSubmit y validaciones y pertenecen a módulos funcionales. No se eligieron para modificar categorias, unidades, ubicaciones, proveedores ni items, y no se abrieron módulos de perfiles/usuarios para esta búsqueda.

Se leyeron por GET dos assets JavaScript cuyos `src` ya estaban presentes en el DOM: `/ideFlex/scripts/codemirror-ui.js` y `/ideFlex/scripts/functionsIdeFlex.js`. No se ejecutaron sus callbacks de escritura ni se llamó ningún endpoint de mutación. Las rutas descritas a continuación se identificaron **en el código cliente**, no en requests de escritura realizadas durante esta etapa.

### Desbloqueo: mecanismo identificado, prueba pendiente

El control observado es `a.codemirror-ui-button.block`, con `original-title="Tomar (Ctrl+E)"`, acotado a la tabla del archivo verificado. «Desbloquear para editar» significa tomar el bloqueo de edición, no liberar un bloqueo ajeno. El cliente exige permiso `allow_taken`, que el botón no esté `inactive` y que `body` tenga clase `ondevelope`.

En el código del cliente, `block()` prepara POST a `modulos/init/php/block.php` con el ID del archivo y espera XML `result resultid` y `result resulttext`. `onBlock()` cambia `options.blocked` a `blockedByMe` y `mirror.setOption('readOnly', false)`. Esas transiciones están identificadas en el asset, **no comprobadas aún con un desbloqueo real**. No se usará `setOption` desde el MCP para simular la toma de un bloqueo.

La fuente no está en desarrollo activo (`body.ondevelope` ausente). Iniciar desarrollo usa el control observado `.startDevelopment` y, según el código, POST a `modulos/init/php/log.php` con acción `init_develope`. Detenerlo usa `stop_develope` en la misma ruta. No se pulsó ninguno. El inicio y cierre temporal del modo desarrollo deben quedar incluidos en la autorización de la prueba.

### Detección de cambios pendientes

Se mantienen las comprobaciones ya verificadas de CodeMirror. Adicionalmente, en el código del cliente `editorChanged()` agrega `unsaved` a `#showSys<id>`, activa Guardar y establece `options.saved=false` si el historial tiene undo. Estos indicadores se comprobarán conjuntamente durante la prueba autorizada.

El callback de Guardar pone `options.saved=true`, pero no se observó una llamada a `markClean()` en ese callback. Por eso **no se supondrá que `isClean()` basta para certificar un guardado posterior**. Esa semántica y el estado del textarea tras modificar todavía deben comprobarse antes de habilitar la escritura operativa.

### Guardado: mecanismo identificado, verificación pendiente

Control observado: `a.codemirror-ui-button.save`, título `Guardar (Ctrl+S)`, dentro de la tabla del archivo. El código exige permiso `allow_update_code`, desarrollo activo y botón no `inactive`. Lee el buffer e incluye `id` y `value` codificado en POST a `modulos/init/php/save.php`.

Según el callback, la respuesta XML contiene `resultid` y `resulttext`. En su rama considerada exitosa, el cliente elimina `unsaved` de la pestaña, inactiva Guardar, habilita Sync, marca el nodo `unsync` y recarga `fileResume.php`. Error/logout muestra notificación de error. **No se observó todavía una respuesta real de guardado ni su valor positivo de resultid.** HTTP 200 o la mera ausencia de `error` no se considerarán prueba suficiente de persistencia.

La validación autorizada deberá correlacionar petición/respuesta con el ID y contenido del único archivo, verificar señal explícita de éxito y estado del panel, y volver a leer el archivo persistido sin perder cambios pendientes. Un resultado incierto debe detener la secuencia y conservar el original, sin reintentos ciegos.

### Sincronización: bloqueada, destino sin comprobar

Control observado: `a.codemirror-ui-button.sync`, título `Sync`, dentro de la tabla. El código cliente exige permiso `allow_synchronized` y desarrollo activo, y prepara POST a `modulos/init/php/sync.php` con **ID y contenido actual del editor**. No verifica explícitamente `options.saved` en ese método: una herramienta segura tendrá que imponer el guardado previo y rechazar cualquier buffer pendiente por su cuenta.

Según el callback, Sync cambia marcas `unsync`/`sync`, inactiva el botón y actualiza el resumen. Esto no demuestra el destino ni el efecto real de la sincronización. **No está identificado un destino de sincronización que pueda garantizarse ajeno a producción.** No se invocará Sync en la primera prueba propuesta, ni siquiera como parte de una escritura/guardado. Validarla requerirá evidencia del destino y una autorización separada compatible con la prohibición de tocar producción.

### Propuesta concreta para la primera prueba

Fuente: `Grupo-2026-11`.

Ruta: `modulos/tipos_movimiento/templates/ver_grid.html`.

No es un archivo auxiliar descartable: es una plantilla funcional. Se propone como alternativa de menor impacto al no encontrar pruebas explícitas en las carpetas inspeccionadas. El cambio no toca SQL, columnas, formularios, hooks, validaciones ni permisos: añade únicamente un comentario HTML al inicio. Eso reduce el riesgo, pero no demuestra que el módulo carezca de uso ni sustituye la autorización.

Contenido actual relevante:

```html
<script type="text/javascript">
	$(document).ready(function(){
			$("#grid_{modulo}_{idFlex}").flexgrid({
```

Se leyó el contenido completo: 1005 caracteres, 40 líneas, sin newline final en el buffer. SHA-256 del texto UTF-8: `dc2401a6fe46488b413c07f09ddc1b88c21456c75c29827ff9a2be9e32b22774`.

Cambio único propuesto: anteponer `<!-- MCP-FLEX: prueba controlada de escritura; comentario temporal. -->` y un LF, sin cambiar el resto. Resultado esperado: 1077 caracteres, 41 líneas, SHA-256 `e5fca9f5021b21ced563922b9ed76546871a834f6d303e5d73305db654eb4992`.

Diff completo del cambio, sin contexto (la salida de `flex_diff_file` con tres líneas de contexto está conservada en la copia local):

```diff
--- a/modulos/tipos_movimiento/templates/ver_grid.html
+++ b/modulos/tipos_movimiento/templates/ver_grid.html
@@ -0,0 +1,1 @@
+<!-- MCP-FLEX: prueba controlada de escritura; comentario temporal. -->
```

Se preservó una copia íntegra local del texto anterior y del propuesto en `.local-review/write-probe-df9ccda4-65fd-4443-9ded-f06e8e7fd716.json`, fuera de Git; se volvió a leer la copia y se verificó su hash. El JSON tiene `authorization: pending` y `allowSync: false`. Esta copia local no implica escribir en FlexIDE ni constituye una autorización.

Restauración propuesta: revalidar antes de empezar que el contenido actual coincide con el hash original; autorizar solo esa ruta y esos dos textos (comentario y original); conservar la copia sin sobrescribirla; activar desarrollo y tomar solo ese archivo; aplicar/guardar el comentario y verificar; restaurar el **texto completo original de la copia**, no una eliminación aproximada de líneas; guardar nuevamente y volver a leer desde la interfaz comprobando igualdad exacta y hash original. Finalmente liberar el bloqueo propio y detener el desarrollo si se activó para la prueba. Si cambia el archivo, hay bloqueo ajeno, resultado incierto o DOM ambiguo, detenerse y conservar la copia para recuperación, sin tocar otros archivos.

La prueba **requiere guardar dos veces** (cambio y restauración). **No requiere ni propone sincronizar**. Ningún otro archivo forma parte del alcance. La igualdad propuesta es del contenido textual verificado; fechas de actividad, historial y bytes originales en disco no pueden prometerse idénticos con la evidencia disponible.

Estado al detenerse: propuesta preparada, diff real comprobado, copia íntegra local verificada; no se inició desarrollo, no se tomó ningún archivo, no se modificó ningún buffer, no se guardó ni sincronizó. La validación real de desbloqueo/escritura/guardado y restauración sigue pendiente de autorización explícita.

## Prueba real autorizada de escritura y restauración — resultado

El usuario autorizó explícitamente solo `modulos/tipos_movimiento/templates/ver_grid.html`, con el comentario y la restauración descritos, incluyendo iniciar/detener desarrollo y tomar/liberar ese archivo. Prohibió Sync y cualquier otra modificación. La prueba se completó una sola vez, antes de ejecutar pruebas automatizadas adicionales. No se repitió para probar el código nuevo.

### Preparación y aislamiento

Se comprobó fuente `Grupo-2026-11`, ID real del archivo `359818`, segmentos `tipos_movimiento/templates/ver_grid.html`, contenido completo y hash de la copia. Se cerró/reabrió el archivo sin cambios para obtener una lectura nueva del servidor antes de empezar. Se registraron contenidos y estados de los demás editores para compararlos al terminar; un archivo ajeno estaba tomado por otra persona y no se tocó.

Durante la prueba se instaló una protección temporal de red: los POST de toma, guardado y liberación solo podían afectar ID `359818`; Guardar solo podía enviar uno de los dos textos aprobados. Se permitieron las acciones de inicio/parada para la fuente ID `189` y las rutas de lectura identificadas. Sync, destinos externos y otros endpoints de mutación se bloquearían. No fue necesario bloquear ninguna solicitud: no se produjo ninguna fuera de alcance. La protección se retiró después de restaurar y verificar el estado final.

### Secuencia ejecutada y resultados reales

| Paso | Request generado por la interfaz | Resultado observado |
| --- | --- | --- |
| Iniciar desarrollo | POST `/ideFlex/modulos/init/php/log.php`, acción `init_develope` | HTTP 200, mensaje `log del usuario guardado correctamente.`, `body.ondevelope` presente |
| Tomar archivo | POST `/ideFlex/modulos/init/php/block.php`, ID `359818` | HTTP 200, XML `resultid=359818`, `resulttext=El archivo se bloqueo correctamente`; `readOnly=false`, `blockedByMe`, sin cambio de contenido |
| Aplicar comentario | Solo `setValue` sobre la instancia CodeMirror verificada del archivo | Buffer igual al texto aprobado; no se llamó a Guardar ni Sync automáticamente |
| Primer guardado | POST `/ideFlex/modulos/init/php/save.php`, ID `359818`, comentario aprobado | HTTP 200, XML `resultid=359818`, `resulttext=Archivo guardado correctamente.` |
| Verificar primer guardado | Cierre del archivo guardado y reapertura por UI; POST `/ideFlex/modulos/init/php/file.php` | Contenido completo reabierto igual al propuesto; estado guardado y limpio |
| Restaurar original | Solo `setValue` del contenido completo de la copia | Buffer igual al original íntegro, no eliminación aproximada del comentario |
| Segundo guardado | POST `/ideFlex/modulos/init/php/save.php`, ID `359818`, original aprobado | HTTP 200, mismo ID y mensaje positivo explícito de guardado |
| Verificar restauración | Nuevo cierre/reapertura mediante UI | Igualdad completa con el original y SHA-256 idéntico |
| Liberar archivo | POST `/ideFlex/modulos/init/php/release.php`, ID `359818` | HTTP 200, XML `resultid=359818`, `resulttext=Archivo liberado correctamente`; `readOnly=true`, `noBlocked` |
| Detener desarrollo | POST `/ideFlex/modulos/init/php/log.php`, acción `stop_develope` | HTTP 200, mensaje de log correcto, `body.ondevelope` ausente |

También aparecieron las lecturas automáticas ya identificadas `fileResume.php` y `home_advance.php`. No se llamó ningún endpoint directamente para escribir: todas las solicitudes de mutación provinieron de los controles del único archivo y los controles de desarrollo autorizados. No se capturaron cookies, tokens, credenciales ni cuerpos completos de requests/responses en archivos de evidencia.

La respuesta de log tiene `resultid` vacío: para iniciar/parar no se asumió éxito por ese campo, sino por la respuesta y el cambio real del estado `body.ondevelope`. Para tomar, guardar y liberar sí se observó el ID exacto en `resultid`. Los espacios finales de `resulttext` se normalizan al comparar el mensaje, sin relajar la comprobación del ID.

### Comprobación final

- Contenido completo final igual al original: **sí**.
- SHA-256 final: `dc2401a6fe46488b413c07f09ddc1b88c21456c75c29827ff9a2be9e32b22774`, igual al original.
- Archivo sin cambios pendientes: **sí**, lectura final limpia; indicador guardado y ausencia de `unsaved` comprobados durante la secuencia.
- Archivo liberado y en solo lectura: **sí**.
- Desarrollo detenido: **sí**.
- Contenidos y estados de los otros editores abiertos iguales a su captura inicial: **sí**.
- Solicitudes de sincronización: **cero**. No se modificaron bases de datos, módulos, perfiles ni producción.

La evidencia local resumida, sin contenido de otros archivos, está en `.local-review/controlled-write-result.json`; el original y la propuesta siguen en la copia íntegra ya documentada. Ambas rutas están excluidas de Git. Las marcas de actividad/historial de FlexIDE cambiaron por las operaciones autorizadas; la igualdad verificada corresponde al contenido textual, no a esas marcas ni a bytes/codificación en disco que la UI no expone.

### Herramientas operativas y barrera después de la prueba

Se implementó `ControlledWriter` y se conectó a las herramientas MCP `flex_unlock_file`, `flex_write_file` y `flex_save_file`. La prueba real se hizo con Playwright y los controles observados; la implementación MCP se comprobó además con Chromium/HTTP interceptados y un ciclo completo de llamadas MCP local. **No se repitió la escritura real** para probar los wrappers.

El host puede suministrar a `createServer(session, {writeApproval})` un alcance humano efímero con fuente, ruta, original íntegro y propuesta exactos. No se acepta esa aprobación en argumentos MCP, variables de entorno, `.env` o JSON del proyecto. El servidor stdio sigue sin autorización activa por defecto. Esta prueba concluida no habilita futuras operaciones.

La secuencia permitida es `approved → unlocked → written → change_saved → restoration_written → restored`. Solo se permite una toma inicial y dos escrituras con dos guardados. `restored` consume el alcance; un error que deje incierto el resultado pasa a `uncertain` y bloquea reintentos automáticos. Una reaprobación o recuperación requiere intervención explícita: no se habilita un segundo archivo ni un texto diferente mediante flags del cliente. El alcance vive en memoria y no se reanuda después de reiniciar el servidor.

- Desbloquear exige el archivo existente ya abierto, fuente/DOM únicos, desarrollo activo, contenido original exacto y archivo libre. No activa desarrollo ni toma bloqueos ajenos automáticamente. Comprueba mensaje XML para el ID exacto y el estado editable real.
- Escribir relee el buffer, rechaza cambios pendientes, otros archivos/textos fuera del alcance y rutas fuera de modulos. Guarda una copia íntegra local con ID aleatorio y creación exclusiva en `.playwright/backups/`, vuelve a leerla y comprueba igualdad antes de tocar el editor. Usa únicamente la instancia asociada al ID real; no guarda ni sincroniza.
- Guardar exige que el buffer pendiente sea el texto aprobado en esa fase. El request debe corresponder al ID y contenido exactos. Se exige el XML y mensaje positivos observados; HTTP 200 o un ID vacío no bastan. Se comprueban las señales de guardado y se cierra/reabre el archivo mediante UI para obtener una lectura nueva, comparar contenido completo y hash. No se fuerza `markClean()` ni se simula el guardado.
- El inicio/parada de desarrollo y la liberación se verificaron en la prueba autorizada; no se agregaron herramientas de administración masiva para esas operaciones.
- `flex_sync_file` continúa bloqueada. No se validó ni recibió autorización y el destino sigue sin comprobarse como ajeno a producción.

Las pruebas aisladas cubren el ciclo completo con copia y restauración, ausencia de autosave, contenido no aprobado, autorización agotada, rutas fuera de alcance, desarrollo detenido, bloqueo ajeno, cambios externos, XML de error, ID ajeno, reintentos bloqueados y respuesta positiva cuyo contenido persistido no coincide. Ninguna usa el perfil real ni llega al servidor de FlexIDE.

Validación final: `npm run build`, `npm run typecheck` y las **42 pruebas** de `npm test` pasaron. Chromium quedó abierto con el archivo restaurado/liberado y desarrollo detenido; no queda un alcance de escritura activo para otra prueba.
