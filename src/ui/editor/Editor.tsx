// Блочный редактор заметки. Блоки берутся из реестра; всё сохраняется само.
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef } from 'react';
import { createObject, updateObject } from '../../core/commands';
import type { Id } from '../../core/types';
import { useApp } from '../../state/store';
import { openNote } from '../nav';
import './blocks';
import './blocksMedia';
import { MATH_NODES } from './math';
import { WAVE4_NODES } from './wave4';
import './math.css';
import { BlockHandle, FormatBar, TableBar } from './Chrome';
import './editor.css';
import { MEDIA_NODES, insertFiles } from './media';
import { mentionExtension, type PickState } from './mention';
import {
  Anchor,
  Breadcrumbs,
  Callout,
  Code,
  Column,
  Columns,
  PageEmbed,
  PageLink,
  TabPanel,
  Tabs,
  Toc,
  Toggle,
  ToggleTitle,
} from './nodes';
import type { InsertContext } from './registry';
import { slashCommands } from './slash';

/** После блока без текста (картинка, таблица, колонки…) в конце страницы всегда остаётся пустая строка. */
const TrailingParagraph = Extension.create({
  name: 'trailingParagraph',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingParagraph'),
        appendTransaction: (_trs, _old, state) => {
          const last = state.doc.lastChild;
          if (!last || last.isTextblock) return null;
          return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
        },
      }),
    ];
  },
});

function initialContent(id: Id) {
  const c = useApp.getState().data.objects[id]?.content;
  if (c?.doc) return c.doc as object;
  if (c?.text) {
    return {
      type: 'doc',
      content: c.text.split('\n').map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })),
    };
  }
  return '';
}

export function BlockEditor({ noteId }: { noteId: Id }) {
  const systemId = useApp((s) => s.data.objects[noteId]?.systemId ?? '');
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  const save = (doc: object, text: string) => {
    pending.current = false;
    const st = useApp.getState();
    if (!st.data.objects[noteId]) return;
    st.commit('Текст заметки', updateObject(st.data, noteId, { content: { format: 'doc', text, doc } }), { mergeKey: `body:${noteId}` });
  };

  const extensions = useMemo(() => {
    const pick: PickState = { mode: 'mention' };
    const ctx = (): InsertContext => ({
      noteId,
      systemId,
      createChild: () => {
        const st = useApp.getState();
        const { ops, id } = createObject(st.data, { systemId, parentId: noteId, type: 'page' });
        return st.commit('Новая страница', ops) ? id : null;
      },
      pickNext: (mode) => (pick.mode = mode),
      notify: (t) => useApp.getState().notify(t),
    });
    return [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node, editor }) => {
          if (node.type.name === 'heading') return `Заголовок ${node.attrs.level}`;
          if (node.type.name === 'toggleTitle') return 'Заголовок раскрывающегося блока';
          return editor.isEmpty ? 'Пишите или нажмите «/», чтобы выбрать блок' : '«/» — блоки, «@» — упомянуть страницу';
        },
      }),
      Code,
      Callout,
      ToggleTitle,
      Toggle,
      Column,
      Columns,
      TabPanel,
      Tabs,
      PageLink,
      PageEmbed,
      Toc,
      Breadcrumbs.configure({ noteId }),
      Anchor,
      ...MEDIA_NODES,
      ...MATH_NODES,
      ...WAVE4_NODES,
      TrailingParagraph,
      mentionExtension({ systemId, noteId, pick }),
      slashCommands(ctx),
    ];
  }, [noteId, systemId]);

  const editor = useEditor(
    {
      extensions,
      content: initialContent(noteId),
      editorProps: {
        attributes: { class: 'ed', 'aria-label': 'Текст заметки' },
        handleClick: (_view, _pos, event) => {
          const t = event.target as HTMLElement;
          const mention = t.closest('[data-mention-id]')?.getAttribute('data-mention-id');
          if (mention) {
            openNote(mention);
            return true;
          }
          const a = t.closest('a');
          const href = a?.getAttribute('href');
          // Ссылки внутри блоков (закладка, файл) открываются сами.
          if (href && !a?.closest('[data-node-view-wrapper]')) {
            if (href.startsWith('#')) {
              document.getElementById(`a-${href.slice(1)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              window.open(href, '_blank', 'noopener');
            }
            return true;
          }
          return false;
        },
        // Картинки и файлы из буфера обмена и перетаскиванием: загружаются и становятся блоками.
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length || event.clipboardData?.getData('text/plain').trim()) return false;
          const ed = editorRef.current;
          if (!ed) return false;
          event.preventDefault();
          insertFiles(ed, files, ed.state.selection.from);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          const ed = editorRef.current;
          if (moved || !files.length || !ed) return false;
          if ((event.target as HTMLElement).closest('.md-uploader')) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? ed.state.selection.from;
          insertFiles(ed, files, at);
          return true;
        },
      },
      onUpdate: ({ editor }) => {
        pending.current = true;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => save(editor.getJSON(), editor.getText({ blockSeparator: '\n' })), 400);
      },
      onBlur: ({ editor }) => {
        if (!pending.current) return;
        clearTimeout(timer.current);
        save(editor.getJSON(), editor.getText({ blockSeparator: '\n' }));
      },
    },
    [extensions],
  );
  editorRef.current = editor;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current && editor) save(editor.getJSON(), editor.getText({ blockSeparator: '\n' }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  if (!systemId) return null;
  return (
    <div className="ed-wrap" ref={wrap}>
      {/* Ручка живёт в собственном постоянном слое: React вставляет её внутрь него,
          а не рядом с панелями, которые библиотека переносит из этого контейнера. */}
      <div className="ed-handle-layer" style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}>{editor && <BlockHandle editor={editor} wrap={wrap} />}</div>
      <EditorContent editor={editor} />
      {editor && <FormatBar editor={editor} />}
      {editor && <TableBar editor={editor} />}
    </div>
  );
}
