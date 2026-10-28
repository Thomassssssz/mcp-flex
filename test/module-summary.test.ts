import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeModule } from '../src/module-summary.js';

function summarize(content: string) {
  return summarizeModule([{ path: 'modulos/demo/php/ver_demo.php', content, sha256: 'fixture', characters: content.length, lines: content.split('\n').length }]);
}

test('resumen estático conserva bloques, expresiones y evidencia de tabla', () => {
  const result = summarize(`<?php
// $idFlex="fake";
$idFlex="id_demo";
$title="Demo";
$sortname='demo_nombre';
$colModel="{display: 'Nombre; con punto y coma', name: 'demo_nombre'}";
$searchItems="{name: '$idFlex'}";
$fields="{field:'demo_nombre', type:'varchar', onchange:'neverExecute()'}";
$urlValidator="modulos/demo/php/validaciones.php";
$onSubmitExecute="";
$qr="Select * from demo_table where id_demo=$id";
?>`);
  assert.equal(result.summary.idFlex[0]?.definitions[0]?.value, 'id_demo');
  assert.equal(result.summary.colModel[0]?.definitions[0]?.text, "{display: 'Nombre; con punto y coma', name: 'demo_nombre'}");
  assert.equal(result.summary.searchItems[0]?.definitions[0]?.kind, 'interpolated_string');
  assert.equal(result.summary.onSubmitExecute[0]?.definitions[0]?.value, '');
  assert.equal(result.summary.searchAdvanceItems[0]?.status, 'missing');
  assert.deepEqual(result.table.candidates, ['demo_table']);
  assert.equal(result.table.evidence[0]?.path, 'modulos/demo/php/ver_demo.php');
  assert.equal(result.summary.idFlex[0]?.definitions[0]?.line, 3);
});

test('condiciones, concatenaciones y código sin ejecutar se informan explícitamente', () => {
  const result = summarize(`<?php
if ($id!="") {$title="Modificar $title_s";} else {$title="Agregar $title_s";}
$fields = buildFields(); $fields .= "{field:'another'}";
$urlValidator = "modulos/" . $modulo . "/php/check.php";
system("never execute");
$query = "select * from one_table join two_table on one_table.id=two_table.id";
?>`);
  assert.equal(result.summary.title[0]?.status, 'multiple_definitions');
  assert.equal(result.summary.fields[0]?.definitions.length, 2);
  assert.equal(result.summary.fields[0]?.definitions[1]?.operator, '.=');
  assert.equal(result.summary.urlValidator[0]?.definitions[0]?.kind, 'expression');
  assert.equal(result.table.status, 'multiple_candidates');
  assert.deepEqual(result.table.candidates, ['one_table', 'two_table']);
});

test('ignora comentarios, variables dentro de cadenas y JS; no inventa tablas por idFlex', () => {
  const result = summarize(`<script>const text='$title = "fake"';</script><?php
/* $title="comment"; */
$other = '$title="inside string";';
$idFlex="id_unknown";
if ($title == "comparison") {}
?> <script>const table="select * from not_php";</script>`);
  assert.equal(result.summary.title[0]?.status, 'missing');
  assert.equal(result.table.status, 'unknown');
});

test('cadenas escapadas, fragmentos incompletos y heredoc no generan valores supuestos', () => {
  const escaped = summarize(String.raw`<?php $title="Say \"quote\""; $fields="{name:'a'}; {name:'b'}"; ?>`);
  assert.equal(escaped.summary.title[0]?.definitions[0]?.kind, 'string_expression');
  assert.equal(escaped.summary.fields[0]?.definitions.length, 1);
  const heredoc = summarize('<?php $idFlex="id_before"; $fields=<<<TEXT\n$title="not code";\nTEXT;');
  assert.equal(heredoc.summary.title[0]?.status, 'missing');
  assert(heredoc.warnings.length > 0);
  const broken = summarize('<?php $title="unterminated');
  assert(broken.warnings.length > 0);
  assert.equal(broken.summary.title[0]?.definitions.length, 0);
});
