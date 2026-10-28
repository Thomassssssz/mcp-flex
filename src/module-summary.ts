/** Análisis estático conservador: nunca ejecuta PHP, JavaScript ni consultas SQL. */
export const SUMMARY_VARIABLES = ['idFlex', 'title', 'sortname', 'colModel', 'searchItems', 'searchAdvanceItems', 'fields', 'urlValidator', 'onSubmitExecute'] as const;
type Token = { kind: 'string' | 'variable' | 'other'; raw: string; start: number; end: number };
type Definition = { line: number; operator: string; expression: string; kind: 'literal' | 'interpolated_string' | 'string_expression' | 'expression'; text?: string; value?: string | boolean | number | null };
type SourceFile = { path: string; content: string; sha256: string; characters: number; lines: number };

function interpolated(raw: string) {
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i] === '\\') { i++; continue; }
    if (raw[i] === '$') return true;
  }
  return false;
}

function tokenize(content: string) {
  const tokens: Token[] = [];
  const warnings: string[] = [];
  let i = 0;
  let php = false;
  while (i < content.length) {
    if (!php) {
      const start = content.slice(i).search(/<\?php\b/i);
      if (start < 0) break;
      i += start + 5; php = true;
    }
    if (content.startsWith('?>', i)) { php = false; i += 2; continue; }
    const char = content[i]!;
    if (/\s/.test(char)) { i++; continue; }
    if (content.startsWith('//', i) || char === '#') {
      const end = content.indexOf('\n', i); i = end < 0 ? content.length : end; continue;
    }
    if (content.startsWith('/*', i)) {
      const end = content.indexOf('*/', i + 2);
      if (end < 0) { warnings.push('Comentario PHP sin terminar; análisis incompleto.'); break; }
      i = end + 2; continue;
    }
    if (content.startsWith('<<<', i)) {
      warnings.push('Heredoc/nowdoc no soportado: se detuvo el análisis para no interpretar su contenido como código.'); break;
    }
    const start = i;
    if (char === '"' || char === "'") {
      i++;
      let closed = false;
      while (i < content.length) {
        if (content[i] === '\\') { i += 2; continue; }
        if (content[i++] === char) { closed = true; break; }
      }
      if (!closed) { warnings.push('Cadena PHP sin terminar; análisis incompleto.'); break; }
      tokens.push({ kind: 'string', raw: content.slice(start, i), start, end: i });
    } else {
      const variable = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(content.slice(i));
      const operator = /^(?:===|!==|==|!=|=>|\?\?=|\.=|\+=|-=|\*=|\/=|<=|>=)/.exec(content.slice(i));
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(content.slice(i));
      const raw = variable?.[0] ?? operator?.[0] ?? word?.[0] ?? char;
      i += raw.length;
      tokens.push({ kind: variable ? 'variable' : 'other', raw, start, end: i });
    }
  }
  return { tokens, warnings };
}

function definition(expressionTokens: Token[], expression: string, line: number, operator: string): Definition {
  const token = expressionTokens.length === 1 ? expressionTokens[0] : undefined;
  if (token?.kind === 'string') {
    const text = token.raw.slice(1, -1);
    const dynamic = token.raw.startsWith('"') && interpolated(token.raw);
    return { line, operator, expression, text,
      kind: dynamic ? 'interpolated_string' : text.includes('\\') ? 'string_expression' : 'literal',
      ...(!dynamic && !text.includes('\\') ? { value: text } : {}),
    };
  }
  if (/^(?:true|false|null)$/i.test(expression)) {
    return { line, operator, expression, kind: 'literal', value: expression.toLowerCase() === 'null' ? null : expression.toLowerCase() === 'true' };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(expression)) return { line, operator, expression, kind: 'literal', value: Number(expression) };
  return { line, operator, expression, kind: 'expression' };
}

export function summarizeModule(files: SourceFile[]) {
  const summary = {} as Record<typeof SUMMARY_VARIABLES[number], {
    path: string; status: 'missing' | 'single_definition' | 'multiple_definitions'; definitions: Definition[];
  }[]>;
  for (const name of SUMMARY_VARIABLES) summary[name] = [];
  const tableEvidence: { name: string; path: string; line: number; source: 'sql_string' }[] = [];
  const warnings: { path: string; message: string }[] = [];
  const fileReports = [];
  for (const file of files) {
    const { tokens, warnings: lexicalWarnings } = tokenize(file.content);
    warnings.push(...lexicalWarnings.map(message => ({ path: file.path, message })));
    const definitions = new Map<string, Definition[]>();
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.kind !== 'variable' || !SUMMARY_VARIABLES.includes(token.raw.slice(1) as typeof SUMMARY_VARIABLES[number])) continue;
      const operator = tokens[i + 1]?.raw;
      if (operator !== '=' && operator !== '.=') continue;
      const start = i + 2;
      let end = start;
      let depth = 0;
      while (end < tokens.length) {
        const current = tokens[end]!;
        if (current.kind === 'other') {
          if (current.raw === ';' && depth === 0) break;
          if (['(', '[', '{'].includes(current.raw)) depth++;
          if ([')', ']', '}'].includes(current.raw)) depth--;
        }
        if (depth < 0) break;
        end++;
      }
      if (tokens[end]?.raw !== ';' || end === start) {
        warnings.push({ path: file.path, message: `No se pudo delimitar la asignación ${token.raw}.` }); continue;
      }
      const expression = file.content.slice(tokens[start]!.start, tokens[end - 1]!.end);
      const line = file.content.slice(0, token.start).split('\n').length;
      const values = definitions.get(token.raw.slice(1)) ?? [];
      values.push(definition(tokens.slice(start, end), expression, line, operator));
      definitions.set(token.raw.slice(1), values);
    }
    for (const name of SUMMARY_VARIABLES) {
      const values = definitions.get(name) ?? [];
      summary[name].push({ path: file.path, status: !values.length ? 'missing' : values.length === 1 ? 'single_definition' : 'multiple_definitions', definitions: values });
    }
    // Solo candidatos presentes en strings SQL reales de PHP; no se infiere una tabla desde idFlex.
    for (const token of tokens.filter(t => t.kind === 'string')) {
      const sql = token.raw.slice(1, -1);
      if (!/^\s*(?:select|update|insert|delete)\b/i.test(sql)) continue;
      for (const match of sql.matchAll(/\b(?:from|join|update|into)\s+`?([A-Za-z_][A-Za-z0-9_]*)`?(?=\s|,|\)|;|$)/gi)) {
        const name = match[1]!;
        if (!tableEvidence.some(e => e.name === name && e.path === file.path)) {
          tableEvidence.push({ name, path: file.path, line: file.content.slice(0, token.start).split('\n').length, source: 'sql_string' });
        }
      }
    }
    fileReports.push({ path: file.path, sha256: file.sha256, characters: file.characters, lines: file.lines,
      templatePlaceholders: [...new Set([...file.content.matchAll(/\{(idFlex|title|sortname|colModel|searchItems|searchAdvanceItems|fields|urlValidator|onSubmitExecute)\}/g)].map(m => m[1]))] });
  }
  const names = [...new Set(tableEvidence.map(e => e.name))];
  return { files: fileReports, table: { status: !names.length ? 'unknown' : names.length === 1 ? 'candidate' : 'multiple_candidates', candidates: names, evidence: tableEvidence },
    summary, warnings,
    analysis: 'Definiciones estáticas con líneas y expresiones originales. No evalúa PHP/JS, variables interpoladas, includes ni condiciones. Los bloques de configuración se devuelven como texto, no como objetos ejecutados. Las tablas son candidatos SQL, no una tabla principal inferida.' };
}
