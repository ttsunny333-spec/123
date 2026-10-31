// Ссылки и вложения: чистые функции без зависимостей, чтобы их можно было проверять тестами.

export function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/** «example.com/a» → «https://example.com/a»; не ссылка → null. */
export function normalizeUrl(raw: string): string | null {
  let t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`;
  const u = parseUrl(t);
  if (!u || !u.hostname.includes('.')) return null;
  return u.href;
}

export interface Embed {
  src: string;
  /** Видео-плеер (16:9) или обычная страница. */
  video: boolean;
  provider: string;
}

const yt = (id: string): Embed => ({ src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, video: true, provider: 'YouTube' });

/** Превращает обычную ссылку сервиса в адрес для встраивания. Неизвестный сервис → null. */
export function embedFor(href: string): Embed | null {
  const u = parseUrl(href);
  if (!u || u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' && seg[0]) return yt(seg[0]);
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const id = u.searchParams.get('v') ?? (['shorts', 'embed', 'live'].includes(seg[0]) ? seg[1] : null);
    if (id) return yt(id);
  }
  if (host === 'vimeo.com' && /^\d+$/.test(seg[0] ?? '')) return { src: `https://player.vimeo.com/video/${seg[0]}`, video: true, provider: 'Vimeo' };
  if (host === 'loom.com' && seg[0] === 'share' && seg[1]) return { src: `https://www.loom.com/embed/${encodeURIComponent(seg[1])}`, video: true, provider: 'Loom' };
  if (host === 'figma.com' && ['file', 'design', 'proto', 'board'].includes(seg[0] ?? '')) {
    return { src: `https://www.figma.com/embed?embed_host=runa&url=${encodeURIComponent(u.href)}`, video: false, provider: 'Figma' };
  }
  if (host === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
    if (m) return { src: `https://docs.google.com/${m[1]}/d/${m[2]}/${m[1] === 'presentation' ? 'embed' : 'preview'}`, video: false, provider: 'Google' };
  }
  if (host === 'open.spotify.com' && ['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(seg[0] ?? '') && seg[1]) {
    return { src: `https://open.spotify.com/embed/${seg[0]}/${encodeURIComponent(seg[1])}`, video: false, provider: 'Spotify' };
  }
  return null;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'file';

export function kindOfFile(f: { type: string; name: string }): MediaKind {
  if (f.type.startsWith('image/')) return 'image';
  if (f.type.startsWith('video/')) return 'video';
  if (f.type.startsWith('audio/')) return 'audio';
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf';
  return 'file';
}

export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
}
