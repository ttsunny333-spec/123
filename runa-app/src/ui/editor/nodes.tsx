// Собственные блоки редактора: выноска, раскрывающийся блок, колонки, вкладки,
// ссылка на страницу, окно страницы, оглавление, хлебные крошки, якорь, код.
import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { ChevronRight, FileText, Plus, X } from 'lucide-react';
import { common, createLowlight } from 'lowlight';
import { useEffect, useState } from 'react';
import { ancestors } from '../../core/queries';
import type { Id, Obj } from '../../core/types';
import { useApp } from '../../state/store';
import { openNote } from '../nav';
import { ICON_PROP } from '../NoteHeader';

const noteTitle = (o: Obj | undefined) => (o ? o.title.trim() || 'Без названия' : 'Удалённая страница');
const NoteGlyph = ({ o, size = 16 }: { o: Obj | undefined; size?: number }) =>
  o && typeof o.props[ICON_PROP] === 'string' ? (
    <span className="ed-emoji" style={{ fontSize: size * 0.95 }} aria-hidden>
      {o.props[ICON_PROP] as string}
    </span>
  ) : (
    <FileText size={size} aria-hidden />
  );

/* ---------------- Выноска ---------------- */

export const CALLOUT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const CALLOUT_EMOJI = ['💡', '📌', '⚠️', '✅', '❗', 'ℹ️', '🔥', '🎯', '📝', '❓', '⭐', '🧭'];

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  return (
    <NodeViewWrapper className={`ed-callout bg-${node.attrs.color}`}>
      <span className="ed-callout-side" contentEditable={false}>
        <button className="ed-callout-emoji" onClick={() => setOpen(!open)} aria-label="Сменить значок и цвет">
          {node.attrs.emoji}
        </button>
        {open && (
          <span className="ed-pop" onMouseLeave={() => setOpen(false)}>
            <span className="ed-pop-grid">
              {CALLOUT_EMOJI.map((e) => (
                <button key={e} onClick={() => updateAttributes({ emoji: e })} aria-label={e}>
                  {e}
                </button>
              ))}
            </span>
            <span className="ed-pop-colors">
              {CALLOUT_COLORS.map((c) => (
                <button key={c} className={`dot bg-${c}`} onClick={() => updateAttributes({ color: c })} aria-label={`Цвет ${c}`} />
              ))}
            </span>
          </span>
        )}
      </span>
      <NodeViewContent className="ed-callout-body" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { emoji: { default: '💡' }, color: { default: 'gray' } };
  },
  parseHTML: () => [{ tag: 'div[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});

/* ---------------- Раскрывающийся блок ---------------- */

export const ToggleTitle = Node.create({
  name: 'toggleTitle',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-toggle-title]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-toggle-title': '' }), 0],
  addKeyboardShortcuts() {
    return {
      // Enter в заголовке раскрывает блок и переводит курсор внутрь.
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'toggleTitle') return false;
        const togglePos = $from.before($from.depth - 1);
        const toggle = editor.state.doc.nodeAt(togglePos);
        if (toggle && !toggle.attrs.open) editor.commands.command(({ tr }) => (tr.setNodeMarkup(togglePos, undefined, { ...toggle.attrs, open: true }), true));
        return editor.commands.setTextSelection($from.after() + 1);
      },
    };
  },
});

function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open === true;
  return (
    <NodeViewWrapper className={`ed-toggle lvl-${node.attrs.level}`} data-open={open ? 'true' : 'false'}>
      <button
        className="ed-toggle-btn"
        contentEditable={false}
        onClick={() => updateAttributes({ open: !open })}
        aria-label={open ? 'Свернуть' : 'Развернуть'}
        aria-expanded={open}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
      <NodeViewContent className="ed-toggle-content" />
    </NodeViewWrapper>
  );
}

export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleTitle block+',
  defining: true,
  addAttributes() {
    return { open: { default: true }, level: { default: 0 } };
  },
  parseHTML: () => [{ tag: 'div[data-toggle]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-toggle': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(ToggleView),
});

export const toggleContent = (level: number) => ({
  type: 'toggle',
  attrs: { open: true, level },
  content: [{ type: 'toggleTitle' }, { type: 'paragraph' }],
});

/* ---------------- Колонки ---------------- */

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-column]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'ed-column' }), 0],
});

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,5}',
  defining: true,
  addAttributes() {
    return { count: { default: 2 } };
  },
  parseHTML: () => [{ tag: 'div[data-columns]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-columns': '', class: 'ed-columns', style: `--cols:${node.childCount}` }),
    0,
  ],
});

export const columnsContent = (n: number) => ({
  type: 'columns',
  attrs: { count: n },
  content: Array.from({ length: n }, () => ({ type: 'column', content: [{ type: 'paragraph' }] })),
});

/* ---------------- Вкладки ---------------- */

export const TabPanel = Node.create({
  name: 'tabPanel',
  content: 'block+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-tab-panel]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-tab-panel': '', class: 'ed-tab-panel' }), 0],
});

function TabsView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const titles: string[] = node.attrs.titles ?? [];
  const active = Math.min(node.attrs.active ?? 0, node.childCount - 1);
  const names = Array.from({ length: node.childCount }, (_, i) => titles[i] || `Вкладка ${i + 1}`);

  const add = () => {
    const pos = (getPos() as number) + node.nodeSize - 1;
    editor.chain().insertContentAt(pos, { type: 'tabPanel', content: [{ type: 'paragraph' }] }).run();
    updateAttributes({ titles: [...names, `Вкладка ${names.length + 1}`], active: names.length });
  };
  const remove = (i: number) => {
    if (node.childCount <= 1) return;
    let pos = (getPos() as number) + 1;
    for (let k = 0; k < i; k++) pos += node.child(k).nodeSize;
    editor.chain().deleteRange({ from: pos, to: pos + node.child(i).nodeSize }).run();
    updateAttributes({ titles: names.filter((_, k) => k !== i), active: Math.max(0, Math.min(active, node.childCount - 2)) });
  };
  const rename = (i: number) => {
    const t = prompt('Название вкладки', names[i]);
    if (t?.trim()) updateAttributes({ titles: names.map((n, k) => (k === i ? t.trim() : n)) });
  };

  return (
    <NodeViewWrapper className="ed-tabs" data-active={active}>
      <div className="ed-tabs-bar" contentEditable={false} role="tablist">
        {names.map((n, i) => (
          <span key={i} className={i === active ? 'ed-tab on' : 'ed-tab'}>
            <button role="tab" aria-selected={i === active} onClick={() => updateAttributes({ active: i })} onDoubleClick={() => rename(i)} title="Двойной клик — переименовать">
              {n}
            </button>
            {node.childCount > 1 && (
              <button className="ed-tab-x" onClick={() => remove(i)} aria-label={`Удалить вкладку «${n}»`}>
                <X size={12} aria-hidden />
              </button>
            )}
          </span>
        ))}
        <button className="ed-tab-add" onClick={add} aria-label="Добавить вкладку">
          <Plus size={14} aria-hidden />
        </button>
      </div>
      <NodeViewContent className="ed-tabs-body" />
    </NodeViewWrapper>
  );
}

export const Tabs = Node.create({
  name: 'tabs',
  group: 'block',
  content: 'tabPanel+',
  defining: true,
  addAttributes() {
    return { titles: { default: ['Вкладка 1', 'Вкладка 2'] }, active: { default: 0 } };
  },
  parseHTML: () => [{ tag: 'div[data-tabs]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-tabs': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(TabsView),
});

export const tabsContent = () => ({
  type: 'tabs',
  attrs: { titles: ['Вкладка 1', 'Вкладка 2'], active: 0 },
  content: [
    { type: 'tabPanel', content: [{ type: 'paragraph' }] },
    { type: 'tabPanel', content: [{ type: 'paragraph' }] },
  ],
});

/* ---------------- Ссылка на страницу и окно страницы ---------------- */

function PageLinkView({ node }: NodeViewProps) {
  const o = useApp((s) => s.data.objects[node.attrs.id as Id]);
  return (
    <NodeViewWrapper className="ed-pagelink" contentEditable={false} data-drag-handle>
      <button onClick={() => o && openNote(o.id)} className={o ? '' : 'gone'}>
        <NoteGlyph o={o} size={18} />
        <span>{noteTitle(o)}</span>
      </button>
    </NodeViewWrapper>
  );
}

export const PageLink = Node.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML: () => [{ tag: 'div[data-page-link]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-page-link': '' })],
  addNodeView: () => ReactNodeViewRenderer(PageLinkView),
});

function PageEmbedView({ node, updateAttributes }: NodeViewProps) {
  const data = useApp((s) => s.data);
  const o = data.objects[node.attrs.id as Id];
  const collapsed = node.attrs.collapsed === true;
  const text = (o?.content?.text ?? '').trim();
  const kids = o ? Object.values(data.objects).filter((x) => x.parentId === o.id && !x.archivedAt) : [];
  return (
    <NodeViewWrapper className="ed-embed" contentEditable={false} data-drag-handle>
      <div className="ed-embed-head">
        <button className="ed-embed-chev" onClick={() => updateAttributes({ collapsed: !collapsed })} aria-label={collapsed ? 'Развернуть' : 'Свернуть'}>
          <ChevronRight size={14} className={collapsed ? '' : 'rot'} aria-hidden />
        </button>
        <NoteGlyph o={o} />
        <button className="ed-embed-title" onClick={() => o && openNote(o.id)}>
          {noteTitle(o)}
        </button>
        {o && (
          <button className="ed-embed-open" onClick={() => openNote(o.id)}>
            Открыть
          </button>
        )}
      </div>
      {!collapsed && o && (
        <div className="ed-embed-body">
          {text ? <p>{text.length > 400 ? `${text.slice(0, 400)}…` : text}</p> : <p className="muted">Пустая страница</p>}
          {kids.length > 0 && (
            <div className="ed-embed-kids">
              {kids.slice(0, 8).map((k) => (
                <button key={k.id} onClick={() => openNote(k.id)}>
                  <NoteGlyph o={k} size={13} /> {noteTitle(k)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const PageEmbed = Node.create({
  name: 'pageEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null }, collapsed: { default: false } };
  },
  parseHTML: () => [{ tag: 'div[data-page-embed]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-page-embed': '' })],
  addNodeView: () => ReactNodeViewRenderer(PageEmbedView),
});

/* ---------------- Оглавление ---------------- */

function headingsOf(editor: Editor) {
  const out: { level: number; text: string; pos: number }[] = [];
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'heading') out.push({ level: n.attrs.level, text: n.textContent || 'Без названия', pos });
    if (n.type.name === 'toggle' && n.attrs.level > 0) out.push({ level: n.attrs.level, text: n.firstChild?.textContent || 'Без названия', pos });
  });
  return out;
}

function TocView({ editor }: NodeViewProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    editor.on('update', f);
    return () => {
      editor.off('update', f);
    };
  }, [editor]);
  const heads = headingsOf(editor);
  return (
    <NodeViewWrapper className="ed-toc" contentEditable={false} data-drag-handle>
      {heads.length === 0 ? (
        <p className="muted">Оглавление появится, когда на странице будут заголовки.</p>
      ) : (
        heads.map((h, i) => (
          <button
            key={i}
            className={`ed-toc-item l${h.level}`}
            onClick={() => {
              const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null;
              dom?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {h.text}
          </button>
        ))
      )}
    </NodeViewWrapper>
  );
}

export const Toc = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  draggable: true,
  parseHTML: () => [{ tag: 'div[data-toc]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-toc': '' })],
  addNodeView: () => ReactNodeViewRenderer(TocView),
});

/* ---------------- Хлебные крошки ---------------- */

function BreadcrumbsView({ extension }: NodeViewProps) {
  const data = useApp((s) => s.data);
  const noteId = (extension.options as { noteId: Id }).noteId;
  const note = data.objects[noteId];
  const path = note ? [...ancestors(data, noteId), note] : [];
  return (
    <NodeViewWrapper className="ed-crumbs" contentEditable={false} data-drag-handle>
      {path.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span className="sep">/</span>}
          <button onClick={() => openNote(p.id)} className={i === path.length - 1 ? 'cur' : ''}>
            <NoteGlyph o={p} size={13} /> {noteTitle(p)}
          </button>
        </span>
      ))}
    </NodeViewWrapper>
  );
}

export const Breadcrumbs = Node.create<{ noteId: Id }>({
  name: 'breadcrumbs',
  group: 'block',
  atom: true,
  draggable: true,
  addOptions: () => ({ noteId: '' }),
  parseHTML: () => [{ tag: 'div[data-breadcrumbs]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-breadcrumbs': '' })],
  addNodeView: () => ReactNodeViewRenderer(BreadcrumbsView),
});

/* ---------------- Якорь ---------------- */

export const Anchor = Node.create({
  name: 'anchor',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { name: { default: '' } };
  },
  parseHTML: () => [{ tag: 'span[data-anchor]', getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute('data-anchor') }) }],
  renderHTML: ({ node }) => ['span', { 'data-anchor': node.attrs.name, class: 'ed-anchor', id: `a-${node.attrs.name}`, title: `Якорь «${node.attrs.name}». Ссылка на него: #${node.attrs.name}` }, `⚓ ${node.attrs.name}`],
});

/* ---------------- Код с подсветкой ---------------- */

const lowlight = createLowlight(common);
const LANGS = ['plaintext', 'javascript', 'typescript', 'python', 'json', 'html', 'css', 'bash', 'sql', 'go', 'rust', 'java', 'cpp', 'csharp', 'php', 'ruby', 'yaml', 'markdown'];

function CodeView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className="ed-code">
      <select contentEditable={false} value={node.attrs.language ?? 'plaintext'} onChange={(e) => updateAttributes({ language: e.target.value })} aria-label="Язык кода">
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const Code = CodeBlockLowlight.extend({
  addNodeView: () => ReactNodeViewRenderer(CodeView),
}).configure({ lowlight, defaultLanguage: 'plaintext' });
