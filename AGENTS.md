# Proyecto: mcp-flex

## Objetivo

Construir un servidor MCP para automatizar tareas de FlexIDE/FlexMind usadas en las actividades y exámenes de la materia.

El sistema debe ayudar a:

- inspeccionar fuentes
- inspeccionar tablas y campos
- crear módulos
- configurar FlexGrid
- configurar FlexForm
- configurar relaciones
- configurar flexCombo
- agregar validaciones
- crear urlValidator
- crear onchange con JavaScript
- crear onSubmitExecute
- guardar archivos
- sincronizar
- instalar módulos
- asociarlos a perfiles
- probar el funcionamiento

## Documentación obligatoria

Antes de implementar funcionalidades, leer los archivos ubicados en la carpeta docs:

- Tutorial de flex.pdf
- Tutorial de flex validaciones.pdf
- Modelo_examen_consignas.docx
- Modelo_examen_tablas.sql
- flexmine.mp4

La documentación del proyecto tiene prioridad sobre suposiciones generales acerca de FlexIDE.

No inventar rutas, endpoints, selectores, nombres de campos ni funciones del framework.

## Arquitectura inicial

Usar:

- Node.js
- TypeScript
- MCP SDK
- Playwright

Inicialmente controlar FlexIDE mediante navegador.

No intentar usar endpoints HTTP internos hasta haberlos identificado mediante Network o inspección real.

## Seguridad

No guardar usuario ni contraseña de FlexIDE en el repositorio.

No incluir cookies o tokens en Git.

Usar una sesión local reutilizable de Playwright.

Nunca ejecutar acciones destructivas sin comprobar primero el elemento afectado.

## Desarrollo incremental

Construir una herramienta MCP por vez.

Orden recomendado:

1. flex_open_browser
2. flex_check_session
3. flex_list_sources
4. flex_open_source
5. flex_list_tables
6. flex_describe_table
7. flex_list_modules
8. flex_read_file
9. flex_write_file
10. flex_sync
11. flex_create_simple_module
12. flex_install_module
13. flex_assign_module_profile

Después agregar herramientas de más alto nivel para:

- generar FlexGrid
- generar FlexForm
- crear flexCombo
- crear validaciones
- crear urlValidator
- crear onchange
- crear onSubmitExecute

## Reglas de FlexIDE

Los módulos normalmente mantienen esta estructura:

modulos/NOMBRE_MODULO/
├── php/
│ ├── ver_NOMBRE_MODULO.php
│ └── ver_NOMBRE_MODULO_abm.php
└── templates/
├── ver_grid.html
└── ver_form.html

El archivo ver_NOMBRE_MODULO.php configura principalmente el FlexGrid.

El archivo ver_NOMBRE_MODULO_abm.php configura principalmente el FlexForm.

Las validaciones JavaScript se agregan normalmente en templates/ver_form.html.

Las validaciones del servidor se conectan mediante urlValidator.

Los procesos posteriores al guardado se conectan mediante onSubmitExecute.

Usar las plantillas generadas por FlexIDE siempre que sea posible.

## Restricción importante

No modificar archivos ni estructuras existentes sin inspeccionarlas primero.

Antes de escribir un archivo:

1. leerlo
2. identificar su estructura
3. modificar solo lo necesario
4. conservar la estructura generada por FlexIDE

## Objetivo de examen

El MCP debe poder recibir una consigna similar a Modelo_examen_consignas.docx y ayudar a construir los módulos requeridos.

Debe poder interpretar:

- tabla catálogo
- tabla principal
- campos
- relaciones
- tipos de controles
- columnas del FlexGrid
- búsquedas
- validaciones
- cálculos
- onchange
- urlValidator
- onSubmitExecute

No asumir que todas las consignas serán iguales al modelo de examen.
