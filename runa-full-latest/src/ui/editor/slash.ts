// Меню «/»: показывает блоки из реестра по категориям, ищет по-русски и по-английски.
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { popupRenderer, type PopupItem } from './popup';
import { CATEGORY_TITLE, searchBlocks, type BlockDef, type InsertContext } from './registry';

type SlashItem = PopupItem & { def: BlockDef };

export function slashCommands(getCtx: () => InsertContext) {
  return Extension.create({
    name: 'slashCommands',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: '/',
          allowSpaces: false,
          // Не открывать меню внутри кода.
          allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== 'codeBlock',
          items: ({ query }) =>
            searchBlocks(query).map((def) => ({
              def,
              label: def.title,
              hint: def.status === 'soon' ? undefined : def.hint ?? def.en,
              glyph: def.glyph,
              group: CATEGORY_TITLE[def.category],
              badge: def.status === 'soon' ? 'скоро' : undefined,
              muted: def.status === 'soon',
            })),
          command: ({ editor, range, props }) => {
            const ctx = getCtx();
            if (props.def.status === 'soon' || !props.def.insert) {
              editor.chain().focus().deleteRange(range).run();
              ctx.notify(`«${props.def.title}» появится в следующих версиях редактора`);
              return;
            }
            props.def.insert(editor, range, ctx);
          },
          render: () => popupRenderer<SlashItem>('Такого блока нет'),
        }),
      ];
    },
  });
}
