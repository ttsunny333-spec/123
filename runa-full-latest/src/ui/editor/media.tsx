// Блоки волны 2: картинка, галерея, видео, аудио, файл, PDF, закладка, встраивание.
import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import {
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  LoaderCircle,
  Minus,
  Music,
  Paperclip,
  Plus,
  RefreshCw,
  FileText,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { newId } from '../../core/order';
import { embedFor, formatSize, kindOfFile, normalizeUrl, type MediaKind } from '../../data/embeds';
import { fetchPreview, uploadMedia, useMediaUrl } from '../../data/media';
import { useApp } from '../../state/store';
import './media.css';

type Kind = MediaKind;

const KINDS: Record<Kind, { title: string; noun: string; accept: string; icon: LucideIcon }> = {
  image: { title: 'Картинка', noun: 'картинку', accept: 'image/*', icon: ImageIcon },
  video: { title: 'Видео', noun: 'видео', accept: 'video/*', icon: Film },
  audio: { title: 'Аудио', noun: 'аудио', accept: 'audio/*', icon: Music },
  file: { title: 'Файл', noun: 'файл', accept: '', icon: Paperclip },
  pdf: { title: 'PDF', noun: 'PDF', accept: 'application/pdf,.pdf', icon: FileText },
};

/** Загрузки, которые идут прямо сейчас: по ним отличаем «грузится» от «прервалась». */
const active = new Set<string>();

/* ---------------- общие кусочки ---------------- */

function Bar({ children, onRemove }: { children?: ReactNode; onRemove: () => void }) {
  return (
    <div className="md-bar" contentEditable={false}>
      {children}
      <button onClick={onRemove} aria-label="Убрать блок" title="Убрать блок (файл останется в хранилище)">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function Fail({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="md-fail" role="alert">
      {text}
      {onRetry && (
        <button className="md-link" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

function Pending({ node, deleteNode }: NodeViewProps) {
  const live = active.has(node.attrs.pending);
  return (
    <NodeViewWrapper className="md md-pending" contentEditable={false}>
      {live ? (
        <>
          <LoaderCircle size={16} className="md-spin" aria-hidden /> Загружаю «{node.attrs.name}»…
        </>
      ) : (
        <>
          Загрузка «{node.attrs.name}» прервана.{' '}
          <button className="md-link" onClick={deleteNode}>
            Убрать блок
          </button>
        </>
      )}
    </NodeViewWrapper>
  );
}

/* ---------------- пустой блок: загрузить или вставить ссылку ---------------- */

function Uploader({ updateAttributes, deleteNode, kind }: NodeViewProps & { kind: Kind }) {
  const meta = KINDS[kind];
  const Icon = meta.icon;
  const [tab, setTab] = useState<'upload' | 'link'>('upload');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | File[] | null) => {
    const file = list && list[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const up = await uploadMedia(file);
      updateAttributes({ path: up.path, name: up.name, size: up.size, mime: up.mime });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const link = (e: FormEvent) => {
    e.preventDefault();
    const u = normalizeUrl(url);
    if (!u) return setErr('Это не похоже на ссылку');
    updateAttributes({ src: u, name: decodeURIComponent(u.split('?')[0].split('/').filter(Boolean).pop() ?? u) });
  };

  return (
    <NodeViewWrapper className="md" contentEditable={false}>
      <div
        className={over ? 'md-uploader drag' : 'md-uploader'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
      >
        <div className="md-head">
          <Icon size={16} aria-hidden />
          <strong>Добавить {meta.noun}</strong>
          <span className="grow" />
          <button onClick={deleteNode} aria-label="Убрать блок" title="Убрать блок">
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="md-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'upload'} className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>
            Загрузить
          </button>
          <button role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? 'on' : ''} onClick={() => setTab('link')}>
            По ссылке
          </button>
        </div>
        {tab === 'upload' ? (
          <div className="md-drop">
            <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Загружаю…' : 'Выбрать файл'}
            </button>
            <span className="md-hint">или перетащите сюда · до 50 МБ</span>
            <input
              ref={input}
              type="file"
              hidden
              accept={meta.accept}
              onChange={(e) => {
                upload(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <form className="md-linkform" onSubmit={link}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Ссылка" autoFocus />
            <button className="btn primary">Вставить</button>
          </form>
        )}
        {err && (
          <div className="md-err" role="alert">
            {err}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/* ---------------- показ по видам ---------------- */

function ImageShown({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const a = node.attrs;
  const { url, failed, retry } = useMediaUrl(a.path, a.src);
  const tried = useRef(false);
  return (
    <NodeViewWrapper className={`md md-image w-${a.width}`} contentEditable={false}>
      <Bar onRemove={deleteNode}>
        {(
          [
            ['s', 'Маленькая'],
            ['m', 'Средняя'],
            ['l', 'Большая'],
          ] as const
        ).map(([w, t]) => (
          <button key={w} className={a.width === w ? 'on' : ''} onClick={() => updateAttributes({ width: w })} title={t} aria-label={t}>
            {w.toUpperCase()}
          </button>
        ))}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Открыть в новой вкладке" title="Открыть в новой вкладке">
            <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </Bar>
      <figure>
        {url ? (
          <img
            src={url}
            alt={a.caption || a.name}
            loading="lazy"
            onError={() => {
              if (!tried.current) {
                tried.current = true;
                retry();
              }
            }}
          />
        ) : failed ? (
          <Fail text="Не удалось загрузить картинку." onRetry={retry} />
        ) : (
          <div className="md-skel" />
        )}
        <figcaption>
          <input value={a.caption} onChange={(e) => updateAttributes({ caption: e.target.value })} placeholder="Подпись" aria-label="Подпись к картинке" />
        </figcaption>
      </figure>
    </NodeViewWrapper>
  );
}

function VideoShown({ node, deleteNode }: NodeViewProps) {
  const a = node.attrs;
  const emb = a.src ? embedFor(a.src) : null;
  const { url, failed, retry } = useMediaUrl(a.path, emb ? null : a.src);
  return (
    <NodeViewWrapper className="md md-video" contentEditable={false}>
      <Bar onRemove={deleteNode}>
        {(url || a.src) && (
          <a href={url ?? a.src} target="_blank" rel="noopener noreferrer" aria-label="Открыть в новой вкладке" title="Открыть в новой вкладке">
            <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </Bar>
      {emb ? (
        <iframe
          className="ratio"
          src={emb.src}
          title={`Видео: ${emb.provider}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : url ? (
        <video controls preload="metadata" src={url} />
      ) : failed ? (
        <Fail text="Не удалось загрузить видео." onRetry={retry} />
      ) : (
        <div className="md-skel ratio" />
      )}
    </NodeViewWrapper>
  );
}

function AudioShown({ node, deleteNode }: NodeViewProps) {
  const a = node.attrs;
  const { url, failed, retry } = useMediaUrl(a.path, a.src);
  return (
    <NodeViewWrapper className="md md-audio" contentEditable={false}>
      <Bar onRemove={deleteNode} />
      <div className="md-card">
        <Music size={18} aria-hidden />
        <div className="md-card-main">
          <span className="md-card-name">{a.name || 'Аудио'}</span>
          {url ? <audio controls preload="metadata" src={url} /> : failed ? <Fail text="Не удалось загрузить аудио." onRetry={retry} /> : <span className="md-hint">Загрузка…</span>}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function FileShown({ node, deleteNode }: NodeViewProps) {
  const a = node.attrs;
  const { url, failed, retry } = useMediaUrl(a.path, a.src, a.name || undefined);
  return (
    <NodeViewWrapper className="md md-file" contentEditable={false}>
      <Bar onRemove={deleteNode} />
      <div className="md-card">
        <Paperclip size={18} aria-hidden />
        <div className="md-card-main">
          <span className="md-card-name">{a.name || 'Файл'}</span>
          <span className="md-hint">{formatSize(a.size) || (a.src ? new URL(a.src).hostname : '')}</span>
        </div>
        {url ? (
          <a className="btn" href={url} target={a.path ? undefined : '_blank'} rel="noopener noreferrer" download={a.path ? a.name || true : undefined}>
            {a.path ? 'Скачать' : 'Открыть'}
          </a>
        ) : failed ? (
          <button className="btn" onClick={retry}>
            Повторить
          </button>
        ) : (
          <LoaderCircle size={16} className="md-spin" aria-hidden />
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** PDF из хранилища отдаётся с запретом на встроенный просмотр, поэтому сначала скачиваем его в память. */
function usePdfBlob(url: string | null, enabled: boolean) {
  const [state, setState] = useState<{ blob: string | null; failed: boolean }>({ blob: null, failed: false });
  useEffect(() => {
    if (!url || !enabled) {
      setState({ blob: null, failed: false });
      return;
    }
    let off = false;
    let made: string | null = null;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        if (off) return;
        made = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
        setState({ blob: made, failed: false });
      })
      .catch(() => !off && setState({ blob: null, failed: true }));
    return () => {
      off = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [url, enabled]);
  return state;
}

function PdfShown({ node, deleteNode }: NodeViewProps) {
  const a = node.attrs;
  const { url, failed, retry } = useMediaUrl(a.path, a.src);
  const pdf = usePdfBlob(url, !!a.path);
  const shown = a.path ? (pdf.blob ?? (pdf.failed ? url : null)) : url;
  return (
    <NodeViewWrapper className="md md-pdf" contentEditable={false}>
      <Bar onRemove={deleteNode}>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Открыть в новой вкладке" title="Открыть в новой вкладке">
            <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </Bar>
      {shown ? (
        <iframe src={shown} title={a.name || 'PDF'} />
      ) : failed ? (
        <Fail text="Не удалось загрузить PDF." onRetry={retry} />
      ) : (
        <div className="md-skel pdf">Загружаю PDF…</div>
      )}
      {a.name && <div className="md-hint center">{a.name}</div>}
    </NodeViewWrapper>
  );
}

function Shown(props: NodeViewProps & { kind: Kind }) {
  switch (props.kind) {
    case 'image':
      return <ImageShown {...props} />;
    case 'video':
      return <VideoShown {...props} />;
    case 'audio':
      return <AudioShown {...props} />;
    case 'pdf':
      return <PdfShown {...props} />;
    default:
      return <FileShown {...props} />;
  }
}

function MediaView(props: NodeViewProps) {
  const kind = props.node.type.name as Kind;
  const a = props.node.attrs;
  if (a.pending) return <Pending {...props} />;
  if (!a.path && !a.src) return <Uploader {...props} kind={kind} />;
  return <Shown {...props} kind={kind} />;
}

const baseAttrs = () => ({
  path: { default: null },
  src: { default: null },
  name: { default: '' },
  size: { default: 0 },
  mime: { default: '' },
  caption: { default: '' },
  width: { default: 'l' },
  pending: { default: null },
});

function mediaNode(kind: Kind) {
  return Node.create({
    name: kind,
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes: baseAttrs,
    parseHTML: () => [{ tag: `div[data-md="${kind}"]` }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-md': kind })],
    addNodeView: () => ReactNodeViewRenderer(MediaView),
  });
}

export const ImageNode = mediaNode('image');
export const VideoNode = mediaNode('video');
export const AudioNode = mediaNode('audio');
export const FileNode = mediaNode('file');
export const PdfNode = mediaNode('pdf');

/* ---------------- галерея ---------------- */

interface GItem {
  path?: string | null;
  src?: string | null;
  name: string;
}

function GalleryThumb({ item, onRemove }: { item: GItem; onRemove: () => void }) {
  const { url, failed, retry } = useMediaUrl(item.path, item.src);
  return (
    <div className="md-gitem">
      {url ? <img src={url} alt={item.name} loading="lazy" /> : failed ? <button className="md-link" onClick={retry}>Повторить</button> : <div className="md-skel" />}
      <button className="x" onClick={onRemove} aria-label={`Убрать «${item.name}»`}>
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}

function GalleryView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const items: GItem[] = node.attrs.items ?? [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setErr(null);
    const added: GItem[] = [];
    const errors: string[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith('image/')) {
        errors.push(`«${f.name}» — не картинка`);
        continue;
      }
      try {
        const up = await uploadMedia(f);
        added.push({ path: up.path, name: up.name });
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    setBusy(false);
    if (added.length) updateAttributes({ items: [...(node.attrs.items ?? []), ...added] });
    if (errors.length) setErr(errors.join('; '));
  };

  return (
    <NodeViewWrapper className="md md-gallery" contentEditable={false}>
      <Bar onRemove={deleteNode} />
      <div className="md-grid">
        {items.map((it, i) => (
          <GalleryThumb key={it.path ?? it.src ?? i} item={it} onRemove={() => updateAttributes({ items: items.filter((_, k) => k !== i) })} />
        ))}
        <button className="md-add" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <LoaderCircle size={16} className="md-spin" aria-hidden /> : <Plus size={16} aria-hidden />}
          {items.length ? 'Добавить' : 'Добавить картинки'}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept="image/*"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {err && (
        <div className="md-err" role="alert">
          {err}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const GalleryNode = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ items: { default: [] } }),
  parseHTML: () => [{ tag: 'div[data-md="gallery"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-md': 'gallery' })],
  addNodeView: () => ReactNodeViewRenderer(GalleryView),
});

/* ---------------- закладка ---------------- */

function BookmarkView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const a = node.attrs;
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (href: string) => {
    setBusy(true);
    let site = href;
    try {
      site = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      /* оставим как есть */
    }
    updateAttributes({ url: href, title: '', description: '', image: '', site });
    try {
      const p = await fetchPreview(href);
      updateAttributes({ title: p.title, description: p.description, image: p.image, site: p.site || site });
    } catch {
      /* карточка остаётся просто со ссылкой */
    }
    setBusy(false);
  };

  if (!a.url) {
    return (
      <NodeViewWrapper className="md" contentEditable={false}>
        <div className="md-uploader">
          <div className="md-head">
            <Globe size={16} aria-hidden />
            <strong>Добавить закладку</strong>
            <span className="grow" />
            <button onClick={deleteNode} aria-label="Убрать блок">
              <X size={14} aria-hidden />
            </button>
          </div>
          <form
            className="md-linkform"
            onSubmit={(e) => {
              e.preventDefault();
              const u = normalizeUrl(url);
              if (!u) return setErr('Это не похоже на ссылку');
              load(u);
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ссылка на страницу: https://…" aria-label="Ссылка" autoFocus />
            <button className="btn primary">Создать</button>
          </form>
          {err && (
            <div className="md-err" role="alert">
              {err}
            </div>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="md md-bookmark-wrap" contentEditable={false}>
      <Bar onRemove={deleteNode}>
        <button onClick={() => load(a.url)} title="Обновить превью" aria-label="Обновить превью" disabled={busy}>
          <RefreshCw size={14} className={busy ? 'md-spin' : ''} aria-hidden />
        </button>
      </Bar>
      <a className="md-bookmark" href={a.url} target="_blank" rel="noopener noreferrer">
        <span className="text">
          <span className="title">{a.title || a.url}</span>
          {a.description && <span className="desc">{a.description}</span>}
          <span className="site">{a.site || a.url}</span>
        </span>
        {a.image && (
          <img
            className="thumb"
            src={a.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
      </a>
    </NodeViewWrapper>
  );
}

export const BookmarkNode = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ url: { default: '' }, title: { default: '' }, description: { default: '' }, image: { default: '' }, site: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-md="bookmark"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-md': 'bookmark' })],
  addNodeView: () => ReactNodeViewRenderer(BookmarkView),
});

/* ---------------- встраивание ---------------- */

function EmbedView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const a = node.attrs;
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!a.src) {
    return (
      <NodeViewWrapper className="md" contentEditable={false}>
        <div className="md-uploader">
          <div className="md-head">
            <Globe size={16} aria-hidden />
            <strong>Встроить страницу или сервис</strong>
            <span className="grow" />
            <button onClick={deleteNode} aria-label="Убрать блок">
              <X size={14} aria-hidden />
            </button>
          </div>
          <form
            className="md-linkform"
            onSubmit={(e) => {
              e.preventDefault();
              const u = normalizeUrl(url);
              if (!u || !u.startsWith('https://')) return setErr('Нужна ссылка, начинающаяся с https://');
              updateAttributes({ src: u });
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube, Figma, Google Docs, Spotify… или любая https-ссылка" aria-label="Ссылка" autoFocus />
            <button className="btn primary">Встроить</button>
          </form>
          {err && (
            <div className="md-err" role="alert">
              {err}
            </div>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  const emb = embedFor(a.src);
  const height = Number(a.height) || 420;
  return (
    <NodeViewWrapper className="md md-embed" contentEditable={false}>
      <Bar onRemove={deleteNode}>
        {!emb?.video && (
          <>
            <button onClick={() => updateAttributes({ height: Math.max(200, height - 100) })} aria-label="Ниже" title="Ниже">
              <Minus size={14} aria-hidden />
            </button>
            <button onClick={() => updateAttributes({ height: Math.min(900, height + 100) })} aria-label="Выше" title="Выше">
              <Plus size={14} aria-hidden />
            </button>
          </>
        )}
        <a href={a.src} target="_blank" rel="noopener noreferrer" aria-label="Открыть в новой вкладке" title="Открыть в новой вкладке">
          <ExternalLink size={14} aria-hidden />
        </a>
      </Bar>
      <iframe
        className={emb?.video ? 'ratio' : ''}
        style={emb?.video ? undefined : { height }}
        src={emb?.src ?? a.src}
        title={emb ? `Встроено: ${emb.provider}` : 'Встроенная страница'}
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        {...(emb ? { allow: 'autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen' } : { sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation' })}
      />
      {!emb && <div className="md-hint center">Если страница не открывается, её сайт запрещает встраивание — откройте её по ссылке справа вверху.</div>}
    </NodeViewWrapper>
  );
}

export const EmbedNode = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ src: { default: null }, height: { default: 420 } }),
  parseHTML: () => [{ tag: 'div[data-md="embed"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-md': 'embed' })],
  addNodeView: () => ReactNodeViewRenderer(EmbedView),
});

export const MEDIA_NODES = [ImageNode, GalleryNode, VideoNode, AudioNode, FileNode, PdfNode, BookmarkNode, EmbedNode];

/* ---------------- вставка файлов из буфера и перетаскиванием ---------------- */

/** Где вставить блок: не посреди абзаца, а рядом с ним (пустой абзац заменяется). */
function blockRange(doc: PMNode, pos: number): { from: number; to: number } {
  const p = Math.max(0, Math.min(pos, doc.content.size));
  const $p = doc.resolve(p);
  if ($p.depth === 0) return { from: p, to: p };
  if ($p.parent.isTextblock) {
    return $p.parent.content.size === 0 ? { from: $p.before(), to: $p.after() } : { from: $p.after(), to: $p.after() };
  }
  return { from: p, to: p };
}

export function insertFiles(editor: Editor, files: File[], at: number) {
  let pos = at;
  for (const file of files) {
    const kind = kindOfFile(file);
    const token = newId();
    active.add(token);
    const range = blockRange(editor.state.doc, pos);
    editor.chain().focus().insertContentAt(range, { type: kind, attrs: { pending: token, name: file.name } }).run();
    pos = range.from + 1;

    const settle = (patch: Record<string, unknown> | null) => {
      active.delete(token);
      if (editor.isDestroyed) return;
      let found: { pos: number; node: PMNode } | null = null;
      editor.state.doc.descendants((n, p) => {
        if (!found && n.attrs && n.attrs.pending === token) {
          found = { pos: p, node: n };
          return false;
        }
        return true;
      });
      const f = found as { pos: number; node: PMNode } | null;
      if (!f) return;
      const { state, view } = editor;
      view.dispatch(patch ? state.tr.setNodeMarkup(f.pos, undefined, { ...f.node.attrs, pending: null, ...patch }) : state.tr.delete(f.pos, f.pos + f.node.nodeSize));
    };

    uploadMedia(file)
      .then((up) => settle({ path: up.path, name: up.name, size: up.size, mime: up.mime }))
      .catch((e) => {
        settle(null);
        useApp.getState().notify((e as Error).message);
      });
  }
}
