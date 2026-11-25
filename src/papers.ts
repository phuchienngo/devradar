import { PAPER_COMPANIES, PAPER_VENUES, PAPER_WINDOW_DAYS, type Source } from './config';
import { fetchRetry, USER_AGENT } from './http';
import type { Candidate } from './types';

interface OaWork {
  doi?: string | null;
  title?: string | null;
  publication_date?: string | null;
  primary_location?: { landing_page_url?: string | null; source?: { id?: string } | null } | null;
  authorships?: { institutions?: { display_name: string; type?: string }[] }[];
  abstract_inverted_index?: Record<string, number[]> | null;
}

const PAGE = 100;
const MAX_PAGES = 3;
const venueNameById = new Map(Object.entries(PAPER_VENUES).flatMap(([name, ids]) => ids.map((id) => [id, name] as const)));

/** OpenAlex trả abstract dưới dạng chỉ mục ngược {từ: [vị trí…]}; ghép lại thành đoạn văn. */
function abstractOf(idx: OaWork['abstract_inverted_index']): string {
  if (!idx) return '';
  const words: string[] = [];
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w;
  return words.filter((w) => w !== undefined).join(' ');
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Paper của các công ty lớn tại các hội nghị hệ thống / CSDL / thuật toán, qua OpenAlex (API công khai, trả JSON).
 * Cùng một paper có thể xuất hiện ở hai nguồn (vd. SIGMOD và PACMMOD) nên dedupe theo tiêu đề.
 */
export async function fetchPapers(src: Source, apiKey?: string): Promise<Candidate[]> {
  const from = new Date(Date.now() - PAPER_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const filter = [
    `primary_location.source.id:${Object.values(PAPER_VENUES).flat().join('|')}`,
    `authorships.institutions.lineage:${Object.values(PAPER_COMPANIES).join('|')}`,
    `from_publication_date:${from}`,
  ].join(',');
  const select = 'doi,title,publication_date,primary_location,authorships,abstract_inverted_index';

  const works: OaWork[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${src.url}?filter=${encodeURIComponent(filter)}&sort=publication_date:desc&per-page=${PAGE}&page=${page}&select=${select}`;
    const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const res = await fetchRetry(url, { headers }, { retries: 2, maxWaitMs: 10_000 });
    if (!res.ok) {
      // 429 có nhiều lý do (hết ngân sách ngày / quá nhanh); nói rõ để biết có cần khoá API không
      const reason = await res.json().then((j) => (j as { reason?: string }).reason, () => undefined);
      throw new Error(`HTTP ${res.status}${reason ? ` (${reason})` : ''}${apiKey ? '' : ', chưa đặt OPENALEX_API_KEY'}`);
    }
    const batch = ((await res.json()) as { results?: OaWork[] }).results ?? [];
    works.push(...batch);
    if (batch.length < PAGE) break;
  }

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const w of works) {
    const title = w.title?.trim();
    const url = w.doi ?? w.primary_location?.landing_page_url;
    if (!title || !url || seen.has(normTitle(title))) continue;
    seen.add(normTitle(title));

    const venue = venueNameById.get((w.primary_location?.source?.id ?? '').split('/').pop() ?? '') ?? 'Paper';
    const companies = [
      ...new Set((w.authorships ?? []).flatMap((a) => a.institutions ?? []).filter((i) => i.type === 'company').map((i) => i.display_name.replace(/\s*\(.*\)$/, ''))),
    ].slice(0, 4);
    const abstract = abstractOf(w.abstract_inverted_index);
    // Ngày hội nghị có thể nằm ở tương lai: không để bài "từ tương lai" chen lên đầu hàng đợi
    const date = w.publication_date ? Math.min(Date.parse(w.publication_date), Date.now()) : NaN;
    out.push({
      url,
      title,
      source: venue,
      channel: src.channel,
      publishedAt: Number.isNaN(date) ? null : date,
      block: '',
      hydrated: {
        snippet: `${companies.join(', ')}${companies.length ? ' · ' : ''}${abstract}`.slice(0, 500),
        content: abstract ? `**${companies.join(', ')}** · ${venue}\n\n${abstract}` : '',
      },
    });
  }
  return out;
}
