import { createHash } from 'node:crypto';

export const contentHash = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');

/** Diff unificado íntegro: un solo hunk cubre todos los cambios, sin truncar contenido. */
export function unifiedDiff(path: string, current: string, proposed: string) {
  if (/[\r\n]/.test(path)) throw new Error('Ruta inválida para encabezados de diff.');
  if (current === proposed) return '';
  // Cada entrada conserva su terminador; distingue CRLF y ausencia de newline final.
  const split = (value: string) => value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const before = split(current);
  const after = split(proposed);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const start = Math.max(0, prefix - 3);
  const tail = Math.min(3, suffix);
  const context = before.slice(start, prefix);
  const removed = before.slice(prefix, before.length - suffix);
  const added = after.slice(prefix, after.length - suffix);
  const endContext = before.slice(before.length - suffix, before.length - suffix + tail);
  const oldCount = context.length + removed.length + endContext.length;
  const newCount = context.length + added.length + endContext.length;
  const render = (sign: string, lines: string[]) => lines.map(line => sign + line + (line.endsWith('\n') ? '' : '\n\\ No newline at end of file\n')).join('');
  return `--- a/${path}\n+++ b/${path}\n@@ -${oldCount ? start + 1 : start},${oldCount} +${newCount ? start + 1 : start},${newCount} @@\n`
    + render(' ', context) + render('-', removed) + render('+', added) + render(' ', endContext);
}
