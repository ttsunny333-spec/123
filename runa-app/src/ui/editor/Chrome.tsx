// Всё, что окружает текст: ручка «⋮⋮» и «+» у блока, меню блока,
// панель форматирования при выделении, панель таблицы.
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react';
import {
  Bold,
  Code as CodeIcon,
  Copy,
  GripVertical,
  Italic,
  Link as LinkIcon,
  Plus,
  Strikethrough,
  Trash2,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { toggleContent } from './nodes';

export const TEXT_COLORS: [string, string][] = [
  ['Обычный', ''],
  ['Серый', '#787774'],
  ['Коричневый', '#9f6b53'],
  ['Оранжевый', '#d9730d'],
  ['Жёлтый', '#cb912f'],
  ['Зелёный', '#448361'],
  ['Синий', '#337ea9'],
  ['Фиолетовый', '#9065b0'],
  ['Розовый', '#c14c8a'],
  ['Красный', '#d44c47'],
];
export const BG_COLORS: [string, string][] = [
  ['Без фона', ''],
  ['Серый', '#f1f1ef'],
  ['Коричневый', '#f4eeee'],
  ['Оранжевый', '#fbecdd'],
  ['Жёлтый', '#fbf3db'],
  ['Зелёный', '#edf3ec'],
  ['Синий', '#e7f3f8'],
  ['Фиолетовый', '#f4f0f7'],
  ['Розовый', '#f9eef3'],
  ['Красный', '#fdebec'],
];

/* ---------------- Ручка блока ---------------- */

interface Hover {
  pos: number;
  top: number;
}

export function BlockHandle({ editor, wrap }: { editor: Editor; wrap: RefObject<HTMLDivElement> }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [menu, setMenu] = useState<Hover | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      if (menu) return;
      const view = editor.view;
      if (!view || view.isDestroyed) return;
      const box = view.dom.getBoundingClientRect();
      if (e.clientY < box.top || e.clientY > box.bottom) return;
      const at = view.posAtCoords({ left: box.left + 24, top: e.clientY });
      if (!at) return;
      const $p = view.state.doc.resolve(at.pos);
      if ($p.depth < 1) return;
      const pos = $p.before(1);
      const dom = view.nodeDOM(pos) as HTMLElement | null;
      if (!dom || !dom.getBoundingClientRect) return;
      const r = dom.getBoundingClientRect();
      const wr = el.getBoundingClientRect();
      const top = r.top - wr.top + Math.min(4, r.height / 2 - 12);
      setHover((cur) => (cur && cur.pos === pos && Math.abs(cur.top - top) < 1 ? cur : { pos, top }));
    };
    const onLeave = () => !menu && setHover(null);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, wrap, menu]);

  if (!hover && !menu) return null;
  const at = menu ?? hover!;
  const node = editor.state.doc.nodeAt(at.pos);
  if (!node) return null;

  const addBelow = () => {
    const end = at.pos + node.nodeSize;
    if (node.type.name === 'paragraph' && node.content.size === 0) {
      editor.chain().focus().setTextSelection(at.pos + 1).insertContent('/').run();
    } else {
      editor.chain().focus().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).insertContent('/').run();
    }
  };

  return (
    <>
      <div className="ed-handle" style={{ top: at.top }} contentEditable={false}>
        <button className="ed-handle-btn" onClick={addBelow} aria-label="Добавить блок ниже" title="Добавить блок ниже">
          <Plus size={16} aria-hidden />
        </button>
        <button
          className="ed-handle-btn grip"
          draggable
          aria-label="Перетащить или открыть меню блока"
          title="Перетащите, чтобы переместить. Нажмите — меню блока"
          onClick={() => setMenu(menu ? null : at)}
          onDragStart={(e) => {
            const view = editor.view;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at.pos)));
            const dom = view.nodeDOM(at.pos) as HTMLElement | null;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.textContent);
            if (dom) e.dataTransfer.setDragImage(dom, 0, 0);
            view.dragging = { slice: view.state.selection.content(), move: true };
            setMenu(null);
          }}
        >
          <GripVertical size={16} aria-hidden />
        </button>
      </div>
      {menu && <BlockMenu editor={editor} pos={menu.pos} top={menu.top} onClose={() => setMenu(null)} />}
    </>
  );
}

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return ref;
}

/* ---------------- Меню блока ---------------- */

function BlockMenu({ editor, pos, top, onClose }: { editor: Editor; pos: number; top: number; onClose: () => void }) {
  const ref = useOutside(onClose);
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return null;
  const end = pos + node.nodeSize;
  const inside = () => editor.chain().focus().setTextSelection(pos + 1);
  const textRange = () => editor.chain().focus().setTextSelection({ from: pos + 1, to: Math.max(pos + 1, end - 1) });

  const turn = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const isText = node.isTextblock;
  const items: [string, () => void][] = [
    ['Текст', () => inside().setParagraph().run()],
    ['Заголовок 1', () => inside().setHeading({ level: 1 }).run()],
    ['Заголовок 2', () => inside().setHeading({ level: 2 }).run()],
    ['Заголовок 3', () => inside().setHeading({ level: 3 }).run()],
    ['Маркированный список', () => inside().toggleBulletList().run()],
    ['Нумерованный список', () => inside().toggleOrderedList().run()],
    ['Чек-лист', () => inside().toggleTaskList().run()],
    ['Цитата', () => inside().toggleBlockquote().run()],
    ['Код', () => inside().toggleCodeBlock().run()],
    ['Выноска', () => inside().wrapIn('callout').run()],
  ];
  if (isText) {
    items.push([
      'Раскрывающийся блок',
      () => {
        const t = toggleContent(0) as { content: { type: string; content?: unknown }[] };
        t.content[0].content = node.content.toJSON() ?? undefined;
        editor.chain().focus().insertContentAt({ from: pos, to: end }, t).run();
      },
    ]);
  }

  return (
    <div className="ed-menu" style={{ top: top + 28 }} ref={ref} role="menu">
      <div className="ed-menu-sec">Превратить в</div>
      <div className="ed-menu-list">
        {items.map(([label, fn]) => (
          <button key={label} role="menuitem" onClick={turn(fn)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ed-menu-sec">Цвет текста</div>
      <div className="ed-swatches">
        {TEXT_COLORS.map(([name, c]) => (
          <button
            key={name}
            className="sw"
            title={name}
            aria-label={`Цвет текста: ${name}`}
            style={{ color: c || 'inherit' }}
            onClick={turn(() => (c ? textRange().setColor(c).run() : textRange().unsetColor().run()))}
          >
            A
          </button>
        ))}
      </div>
      <div className="ed-menu-sec">Фон</div>
      <div className="ed-swatches">
        {BG_COLORS.map(([name, c]) => (
          <button
            key={name}
            className="sw"
            title={name}
            aria-label={`Фон: ${name}`}
            style={{ background: c || 'transparent' }}
            onClick={turn(() => (c ? textRange().setHighlight({ color: c }).run() : textRange().unsetHighlight().run()))}
          >
            {c ? '' : '∅'}
          </button>
        ))}
      </div>
      <div className="ed-menu-sep" />
      <button className="ed-menu-act" onClick={turn(() => editor.chain().focus().insertContentAt(end, node.toJSON()).run())}>
        <Copy size={14} aria-hidden /> Дублировать
      </button>
      <button className="ed-menu-act danger" onClick={turn(() => editor.chain().focus().deleteRange({ from: pos, to: end }).run())}>
        <Trash2 size={14} aria-hidden /> Удалить
      </button>
    </div>
  );
}

/* ---------------- Панель форматирования ---------------- */

export function FormatBar({ editor }: { editor: Editor }) {
  const [colors, setColors] = useState(false);
  const btn = (active: boolean, label: string, fn: () => void, icon: JSX.Element) => (
    <button className={active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={fn} aria-label={label} title={label} aria-pressed={active}>
      {icon}
    </button>
  );
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="formatBar"
      tippyOptions={{ duration: 100, placement: 'top', onHidden: () => setColors(false) }}
      shouldShow={({ editor: ed, state }) => {
        const { empty } = state.selection;
        if (empty || !ed.isEditable) return false;
        if (state.selection instanceof NodeSelection) return false;
        if (ed.isActive('codeBlock')) return false;
        return true;
      }}
    >
      <div className="ed-bubble" role="toolbar" aria-label="Форматирование">
        {btn(editor.isActive('bold'), 'Жирный (Ctrl+B)', () => editor.chain().focus().toggleBold().run(), <Bold size={15} aria-hidden />)}
        {btn(editor.isActive('italic'), 'Курсив (Ctrl+I)', () => editor.chain().focus().toggleItalic().run(), <Italic size={15} aria-hidden />)}
        {btn(editor.isActive('underline'), 'Подчёркнутый (Ctrl+U)', () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={15} aria-hidden />)}
        {btn(editor.isActive('strike'), 'Зачёркнутый (Ctrl+Shift+S)', () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={15} aria-hidden />)}
        {btn(editor.isActive('code'), 'Код в строке (Ctrl+E)', () => editor.chain().focus().toggleCode().run(), <CodeIcon size={15} aria-hidden />)}
        {btn(
          editor.isActive('link'),
          'Ссылка',
          () => {
            if (editor.isActive('link')) return editor.chain().focus().unsetLink().run();
            const url = prompt('Адрес ссылки (https://… или #якорь)');
            if (url?.trim()) editor.chain().focus().setLink({ href: url.trim() }).run();
          },
          <LinkIcon size={15} aria-hidden />,
        )}
        <span className="ed-bubble-sep" />
        <button className={colors ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setColors(!colors)} aria-label="Цвет текста и фона" title="Цвет">
          <span className="ed-a">A</span>
        </button>
        {colors && (
          <div className="ed-colors">
            <div className="ed-menu-sec">Цвет текста</div>
            <div className="ed-swatches">
              {TEXT_COLORS.map(([name, c]) => (
                <button
                  key={name}
                  className="sw"
                  title={name}
                  style={{ color: c || 'inherit' }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run())}
                >
                  A
                </button>
              ))}
            </div>
            <div className="ed-menu-sec">Фон</div>
            <div className="ed-swatches">
              {BG_COLORS.map(([name, c]) => (
                <button
                  key={name}
                  className="sw"
                  title={name}
                  style={{ background: c || 'transparent' }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (c ? editor.chain().focus().setHighlight({ color: c }).run() : editor.chain().focus().unsetHighlight().run())}
                >
                  {c ? '' : '∅'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}

/* ---------------- Панель таблицы ---------------- */

export function TableBar({ editor }: { editor: Editor }) {
  const b = (label: string, fn: () => void) => (
    <button onMouseDown={(e) => e.preventDefault()} onClick={fn}>
      {label}
    </button>
  );
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBar"
      tippyOptions={{ duration: 100, placement: 'top-start' }}
      shouldShow={({ editor: ed, state }) => ed.isActive('table') && state.selection.empty}
    >
      <div className="ed-bubble table" role="toolbar" aria-label="Таблица">
        {b('+ строка', () => editor.chain().focus().addRowAfter().run())}
        {b('+ столбец', () => editor.chain().focus().addColumnAfter().run())}
        {b('− строка', () => editor.chain().focus().deleteRow().run())}
        {b('− столбец', () => editor.chain().focus().deleteColumn().run())}
        {b('Заголовок', () => editor.chain().focus().toggleHeaderRow().run())}
        {b('Удалить таблицу', () => editor.chain().focus().deleteTable().run())}
      </div>
    </BubbleMenu>
  );
}
