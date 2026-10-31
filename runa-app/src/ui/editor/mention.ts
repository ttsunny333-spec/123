// «@» — упоминание заметки. Тот же список используется для блоков «Ссылка на страницу» и «Окно страницы».
import { mergeAttributes } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { PluginKey } from '@tiptap/pm/state';
import { createObject } from '../../core/commands';
import { isHidden } from '../../core/queries';
import type { Id } from '../../core/types';
import { useApp } from '../../state/store';
import { ICON_PROP } from '../NoteHeader';
import { popupRenderer, type PopupItem } from './popup';

export interface PickState {
  mode: 'mention' | 'pageLink' | 'pageEmbed';
}

type MentionItem = PopupItem & { id?: Id; create?: string };

const titleOf = (id: Id) => {
  const o = useApp.getState().data.objects[id];
  return o ? o.title.trim() || 'Без названия' : 'удалённая страница';
};

export function mentionExtension(opts: { systemId: Id; noteId: Id; pick: PickState }) {
  return Mention.extend({ name: 'mention' }).configure({
    HTMLAttributes: { class: 'ed-mention' },
    renderHTML({ options, node }) {
      return ['span', mergeAttributes({ 'data-type': 'mention', 'data-mention-id': node.attrs.id }, options.HTMLAttributes), `@${titleOf(node.attrs.id)}`];
    },
    renderText: ({ node }) => `@${titleOf(node.attrs.id)}`,
    suggestion: {
      char: '@',
      pluginKey: new PluginKey('mention-suggest'),
      items: ({ query }): MentionItem[] => {
        const st = useApp.getState().data;
        const q = query.trim().toLowerCase();
        const found: MentionItem[] = Object.values(st.objects)
          .filter((o) => o.systemId === opts.systemId && o.id !== opts.noteId && !isHidden(st, o.id))
          .filter((o) => !q || o.title.toLowerCase().includes(q))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 10)
          .map((o) => ({
            id: o.id,
            label: o.title.trim() || 'Без названия',
            glyph: typeof o.props[ICON_PROP] === 'string' ? (o.props[ICON_PROP] as string) : '📄',
            group: opts.pick.mode === 'mention' ? 'Упомянуть страницу' : opts.pick.mode === 'pageLink' ? 'Ссылка на страницу' : 'Окно страницы',
          }));
        if (q) found.push({ label: `Создать «${query.trim()}»`, glyph: '+', hint: 'новая вложенная страница', create: query.trim() });
        return found;
      },
      command: ({ editor, range, props }) => {
        const item = props as unknown as MentionItem;
        let id = item.id;
        if (item.create) {
          const st = useApp.getState();
          const res = createObject(st.data, { systemId: opts.systemId, parentId: opts.noteId, type: 'page', title: item.create });
          if (!st.commit('Новая страница', res.ops)) return;
          id = res.id;
        }
        const mode = opts.pick.mode;
        opts.pick.mode = 'mention';
        if (mode === 'pageLink' || mode === 'pageEmbed') {
          editor.chain().focus().deleteRange(range).insertContent({ type: mode, attrs: { id } }).run();
          return;
        }
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'mention', attrs: { id, label: item.label } },
            { type: 'text', text: ' ' },
          ])
          .run();
      },
      render: () => {
        const r = popupRenderer<MentionItem>('Нет подходящих страниц');
        return {
          ...r,
          onExit: () => {
            r.onExit();
            setTimeout(() => (opts.pick.mode = 'mention'), 0);
          },
        };
      },
    },
  });
}
