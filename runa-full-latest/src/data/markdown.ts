// Экспорт заметок в Markdown и импорт .md обратно. Без зависимостей; ZIP собирается вручную.

type JNode = { type: string; attrs?: Record<string, any>; content?: JNode[]; text?: string; marks?: { type: string; attrs?: Record<string, any> }[] };

export interface MdCtx {
  titleOf: (id: string) => string;
}

function applyMarks(text: string, marks: JNode['marks']): string {
  let t = text;
  const has = (k: string) => marks?.some((m) => m.type === k);
  if (has('code')) t = '`' + t + '`';
  if (has('bold')) t = `**${t}**`;
  if (has('italic')) t = `*${t}*`;
  if (has('strike')) t = `~~${t}~~`;
  const link = marks?.find((m) => m.type === 'link');
  if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
  return t;
}

function inline(nodes: JNode[] | undefined, ctx: MdCtx): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'text') return applyMarks(n.text ?? '', n.marks);
      if (n.type === 'hardBreak') return '  \n';
      if (n.type === 'mention' || n.type === 'pageLink' || n.type === 'pageEmbed') return `[[${ctx.titleOf(n.attrs?.id ?? '')}]]`;
      if (n.type === 'anchor') return `<a id="${n.attrs?.name ?? ''}"></a>`;
      if (n.type === 'image' || n.type === 'video' || n.type === 'audio' || n.type === 'file' || n.type === 'pdf') return `*[${n.attrs?.name || n.type}]*`;
      return inline(n.content, ctx);
    })
    .join('');
}

const prefixLines = (s: string, p: string) => s.split('\n').map((l) => (l ? p + l : p.trimEnd())).join('\n');

function block(n: JNode, ctx: MdCtx): string {
  const kids = (n.content ?? []).map((c) => block(c, ctx)).filter((s) => s !== '');
  switch (n.type) {
    case 'doc':
      return kids.join('\n\n');
    case 'paragraph':
      return inline(n.content, ctx);
    case 'heading':
      return '#'.repeat(n.attrs?.level ?? 1) + ' ' + inline(n.content, ctx);
    case 'bulletList':
      return (n.content ?? []).map((li) => listItem(li, '- ', ctx)).join('\n');
    case 'orderedList':
      return (n.content ?? []).map((li, i) => listItem(li, `${i + 1}. `, ctx)).join('\n');
    case 'taskList':
      return (n.content ?? []).map((li) => listItem(li, `- [${li.attrs?.checked ? 'x' : ' '}] `, ctx)).join('\n');
    case 'blockquote':
      return prefixLines(kids.join('\n\n'), '> ');
    case 'codeBlock':
      return '```' + (n.attrs?.language && n.attrs.language !== 'plaintext' ? n.attrs.language : '') + '\n' + (n.content ?? []).map((c) => c.text ?? '').join('') + '\n```';
    case 'horizontalRule':
      return '---';
    case 'callout':
      return '> [!NOTE] ' + (n.attrs?.emoji ?? '') + '\n' + prefixLines(kids.join('\n\n'), '> ');
    case 'toggle': {
      const [title, ...rest] = n.content ?? [];
      return `**${inline(title?.content, ctx)}**\n\n` + rest.map((c) => block(c, ctx)).filter(Boolean).join('\n\n');
    }
    case 'columns':
    case 'column':
    case 'tabs':
    case 'tabPanel':
      return kids.join('\n\n');
    case 'table': {
      const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => inline(c.content?.flatMap((p) => p.content ?? []) ?? [], ctx).replace(/\|/g, '\\|').replace(/\n/g, ' ')));
      if (!rows.length) return '';
      const w = Math.max(...rows.map((r) => r.length));
      const fill = (r: string[]) => '| ' + Array.from({ length: w }, (_, i) => r[i] ?? '').join(' | ') + ' |';
      return [fill(rows[0]), '|' + ' --- |'.repeat(w), ...rows.slice(1).map(fill)].join('\n');
    }
    case 'equation':
      return '$$\n' + (n.attrs?.tex ?? '') + '\n$$';
    case 'mermaid':
      return '```mermaid\n' + (n.attrs?.code ?? '') + '\n```';
    case 'pageLink':
    case 'pageEmbed':
      return `[[${ctx.titleOf(n.attrs?.id ?? '')}]]`;
    case 'anchor':
      return `<a id="${n.attrs?.name ?? ''}"></a>`;
    case 'toc':
    case 'breadcrumbs':
      return '';
    case 'bookmark':
      return n.attrs?.url ? `[${n.attrs?.title || n.attrs.url}](${n.attrs.url})` : '';
    case 'embed':
      return n.attrs?.src ? `[${n.attrs.src}](${n.attrs.src})` : '';
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
    case 'pdf':
    case 'gallery':
      return `*[${n.attrs?.name || n.type}]*`;
    default:
      return kids.length ? kids.join('\n\n') : inline(n.content, ctx);
  }
}

function listItem(li: JNode, marker: string, ctx: MdCtx): string {
  const parts = (li.content ?? []).map((c) => block(c, ctx)).filter((s) => s !== '');
  const [first = '', ...rest] = parts;
  const indent = ' '.repeat(marker.length);
  const body = [first, ...rest.map((r) => prefixLines(r, indent))].join('\n' + indent);
  return marker + body.replace(/\n(\s*)$/, '');
}

/** Документ TipTap → Markdown (как в Obsidian). Неизвестные блоки выводятся текстом. */
export function docToMarkdown(doc: unknown, ctx: MdCtx): string {
  if (!doc || typeof doc !== 'object') return '';
  return block(doc as JNode, ctx).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Markdown → текст заметки. Формат сохраняется как текст: заголовки, списки и чек-листы остаются видимыми как есть. */
export function markdownToText(md: string): string {
  return md.replace(/\r\n/g, '\n').trimEnd();
}

/** Имя файла без недопустимых символов. */
export function safeFileName(title: string): string {
  const t = title.trim().replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return t || 'Без названия';
}

/* ---------------- ZIP (без сжатия) ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Собирает ZIP из файлов без сжатия. Имена в UTF-8 (флаг 0x0800), поэтому кириллица читается. */
export function makeZip(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0),
    ]);
    parts.push(local, name, f.data);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ]),
      name,
    );
    offset += local.length + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
