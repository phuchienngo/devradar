import HEAD from './web/head.html';
import INDEX from './web/index.html';
import READ from './web/read.html';
import { render } from './template';

/** Trang điều khiển (tĩnh, dựng một lần). */
export const PAGE = render(INDEX, { head: HEAD });

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Trang đọc bản lưu (Markdown). Giá trị chèn vào đều được escape; chỉ nhận link http(s). */
export function renderArticle(a: { id: string; title: string; url: string; source: string; publishedAt: number | null; sentAt: number; body: string }): string {
  return render(READ, {
    head: HEAD,
    id: a.id,
    title: a.title,
    source: a.source,
    url: /^https?:\/\//i.test(a.url) ? a.url : '#',
    dates: (a.publishedAt ? `đăng ${day(a.publishedAt)} · ` : '') + `lưu ${day(a.sentAt)}`,
    body: a.body,
  });
}
