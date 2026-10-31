// Чистые функции для превью ссылок: без сети, поэтому их можно проверять тестами.

export interface Preview {
  title: string;
  description: string;
  image: string;
  site: string;
}

const privateV4 = (a: number, b: number) =>
  a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;

/** Адреса, на которые нельзя ходить с сервера: локальные, внутренние, служебные. */
export function badHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (h.startsWith('[') || h.includes(':')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) return privateV4(Number(m[1]), Number(m[2]));
  return !h.includes('.');
}

export function privateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:');
  }
  const p = ip.split('.').map(Number);
  return p.length === 4 && privateV4(p[0], p[1]);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCode(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const safeCode = (n: number) => (n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '');

const clean = (s: string | undefined, max: number) => decodeEntities((s ?? '').replace(/\s+/g, ' ').trim()).slice(0, max);

export function extractPreview(html: string, finalUrl: string): Preview {
  const headEnd = html.search(/<\/head>/i);
  const head = html.slice(0, headEnd > 0 ? headEnd : 200_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const content = val ? (val[1] ?? val[2]) : undefined;
    if (key && content !== undefined && !(key in meta)) meta[key] = content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  let host = '';
  try {
    host = new URL(finalUrl).hostname.replace(/^www\./, '');
  } catch {
    /* пусто */
  }
  let image = '';
  const rawImg = meta['og:image'] ?? meta['twitter:image'] ?? '';
  if (rawImg) {
    try {
      const u = new URL(decodeEntities(rawImg), finalUrl);
      if (u.protocol === 'https:' || u.protocol === 'http:') image = u.href;
    } catch {
      /* битая ссылка на картинку */
    }
  }
  return {
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, 200),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta['description'], 300),
    image,
    site: clean(meta['og:site_name'], 80) || host,
  };
}
