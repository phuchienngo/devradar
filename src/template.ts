const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/**
 * Template tối giản kiểu Mustache: {{ten}} được escape HTML, {{{ten}}} chèn nguyên văn (chỉ dùng cho HTML tin cậy).
 * Chỉ quét template một lần nên giá trị chèn vào không bị hiểu thành placeholder.
 */
export function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g, (_, rawName?: string, name?: string) =>
    rawName ? (vars[rawName] ?? '') : esc(vars[name!] ?? ''),
  );
}
