// Превью ссылки для блока «Закладка»: название, описание и картинка страницы.
// Доступна только вошедшим пользователям (verify_jwt). Локальные и внутренние адреса запрещены.
import { badHost, extractPreview, privateIp } from './parse.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function resolvesPrivate(host: string): Promise<boolean> {
  try {
    for (const type of ['A', 'AAAA'] as const) {
      const ips: string[] = await Deno.resolveDns(host, type).catch(() => []);
      if (ips.some(privateIp)) return true;
    }
  } catch {
    /* проверка DNS недоступна в этой среде */
  }
  return false;
}

async function readCapped(res: Response, cap: number, contentType: string): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(all);
  } catch {
    return new TextDecoder().decode(all);
  }
}

async function get(start: URL): Promise<{ html: string; final: URL }> {
  let cur = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(cur.protocol) || badHost(cur.hostname) || (await resolvesPrivate(cur.hostname))) throw new Error('blocked');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(cur, {
        redirect: 'manual',
        signal: ctl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RunaLinkPreview/1.0)', Accept: 'text/html,application/xhtml+xml' },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error('redirect');
        cur = new URL(loc, cur);
        continue;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const ct = res.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml/i.test(ct)) throw new Error('not html');
      return { html: await readCapped(res, 400_000, ct), final: cur };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('too many redirects');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    let url: URL;
    try {
      url = new URL(String(body.url ?? ''));
    } catch {
      return json({ error: 'bad url' }, 400);
    }
    const { html, final } = await get(url);
    return json({ ...extractPreview(html, final.href), url: final.href });
  } catch (e) {
    return json({ error: (e as Error).message }, 422);
  }
});
