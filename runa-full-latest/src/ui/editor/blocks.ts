// Каталог блоков. Волна 1 — работает; волны 2–4 видны в «/» с пометкой «скоро».
import type { Editor, Range } from '@tiptap/core';
import { columnsContent, tabsContent, toggleContent } from './nodes';
import { registerBlock, type BlockDef, type InsertContext } from './registry';

const run = (fn: (e: Editor) => void) => (e: Editor, r: Range) => {
  e.chain().focus().deleteRange(r).run();
  fn(e);
};
const insert = (content: object) => run((e) => e.chain().focus().insertContent(content).run());

const ready: BlockDef[] = [
  // Текст
  { id: 'text', title: 'Текст', en: 'Text', category: 'text', glyph: 'Aa', keywords: 'paragraph абзац', insert: run((e) => e.chain().focus().setParagraph().run()) },
  { id: 'h1', title: 'Заголовок 1', en: 'Heading 1', category: 'text', glyph: 'H1', hint: '#', keywords: 'h1 title', insert: run((e) => e.chain().focus().setHeading({ level: 1 }).run()) },
  { id: 'h2', title: 'Заголовок 2', en: 'Heading 2', category: 'text', glyph: 'H2', hint: '##', keywords: 'h2', insert: run((e) => e.chain().focus().setHeading({ level: 2 }).run()) },
  { id: 'h3', title: 'Заголовок 3', en: 'Heading 3', category: 'text', glyph: 'H3', hint: '###', keywords: 'h3', insert: run((e) => e.chain().focus().setHeading({ level: 3 }).run()) },
  { id: 'bullet', title: 'Маркированный список', en: 'Bulleted list', category: 'text', glyph: '•', hint: '-', keywords: 'list ul список', insert: run((e) => e.chain().focus().toggleBulletList().run()) },
  { id: 'numbered', title: 'Нумерованный список', en: 'Numbered list', category: 'text', glyph: '1.', hint: '1.', keywords: 'list ol список', insert: run((e) => e.chain().focus().toggleOrderedList().run()) },
  { id: 'todo', title: 'Чек-лист', en: 'To-do list', category: 'text', glyph: '☑', hint: '[]', keywords: 'checklist задачи галочки todo', insert: run((e) => e.chain().focus().toggleTaskList().run()) },
  { id: 'toggle', title: 'Раскрывающийся блок', en: 'Toggle list', category: 'text', glyph: '▸', hint: '>', keywords: 'toggle expand свернуть раскрыть', insert: insert(toggleContent(0)) },
  { id: 'toggle-h1', title: 'Раскрывающийся заголовок 1', en: 'Toggle heading 1', category: 'text', glyph: '▸1', keywords: 'toggle heading', insert: insert(toggleContent(1)) },
  { id: 'toggle-h2', title: 'Раскрывающийся заголовок 2', en: 'Toggle heading 2', category: 'text', glyph: '▸2', keywords: 'toggle heading', insert: insert(toggleContent(2)) },
  { id: 'toggle-h3', title: 'Раскрывающийся заголовок 3', en: 'Toggle heading 3', category: 'text', glyph: '▸3', keywords: 'toggle heading', insert: insert(toggleContent(3)) },
  { id: 'quote', title: 'Цитата', en: 'Quote', category: 'text', glyph: '❝', hint: '"', keywords: 'blockquote', insert: run((e) => e.chain().focus().setBlockquote().run()) },
  { id: 'callout', title: 'Выноска', en: 'Callout', category: 'text', glyph: '💡', keywords: 'callout заметка блок', insert: insert({ type: 'callout', attrs: { emoji: '💡', color: 'gray' }, content: [{ type: 'paragraph' }] }) },
  { id: 'code', title: 'Код', en: 'Code', category: 'text', glyph: '</>', hint: '```', keywords: 'code snippet программа', insert: run((e) => e.chain().focus().setCodeBlock().run()) },
  { id: 'divider', title: 'Разделитель', en: 'Divider', category: 'text', glyph: '—', hint: '---', keywords: 'hr line линия', insert: run((e) => e.chain().focus().setHorizontalRule().run()) },

  // Структура
  { id: 'page', title: 'Вложенная страница', en: 'Page', category: 'structure', glyph: '📄', keywords: 'page subpage подстраница страница', insert: (e, r, ctx) => {
    e.chain().focus().deleteRange(r).run();
    const id = ctx.createChild();
    if (id) e.chain().focus().insertContent({ type: 'pageLink', attrs: { id } }).run();
  } },
  { id: 'page-embed', title: 'Окно страницы', en: 'Page embed', category: 'structure', glyph: '⧉', keywords: 'embed окно карточка встроить', insert: (e, r, ctx) => {
    ctx.pickNext('pageEmbed');
    e.chain().focus().deleteRange(r).insertContent('@').run();
  } },
  { id: 'columns-2', title: '2 колонки', en: '2 columns', category: 'structure', glyph: '▥', keywords: 'columns колонки layout', insert: insert(columnsContent(2)) },
  { id: 'columns-3', title: '3 колонки', en: '3 columns', category: 'structure', glyph: '▥', keywords: 'columns колонки layout', insert: insert(columnsContent(3)) },
  { id: 'columns-4', title: '4 колонки', en: '4 columns', category: 'structure', glyph: '▥', keywords: 'columns колонки layout', insert: insert(columnsContent(4)) },
  { id: 'columns-5', title: '5 колонок', en: '5 columns', category: 'structure', glyph: '▥', keywords: 'columns колонки layout', insert: insert(columnsContent(5)) },
  { id: 'tabs', title: 'Вкладки', en: 'Tabs', category: 'structure', glyph: '⊟', keywords: 'tabs tab container вкладки', insert: insert(tabsContent()) },

  // Таблицы
  { id: 'table', title: 'Простая таблица', en: 'Table', category: 'data', glyph: '▦', keywords: 'table таблица grid', insert: run((e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()) },

  // Навигация
  { id: 'page-link', title: 'Ссылка на страницу', en: 'Link to page', category: 'navigation', glyph: '↗', keywords: 'link page ссылка объект запись', insert: (e, r, ctx) => {
    ctx.pickNext('pageLink');
    e.chain().focus().deleteRange(r).insertContent('@').run();
  } },
  { id: 'mention', title: 'Упоминание', en: 'Mention', category: 'navigation', glyph: '@', hint: '@', keywords: 'mention упомянуть', insert: run((e) => e.chain().focus().insertContent('@').run()) },
  { id: 'toc', title: 'Оглавление', en: 'Table of contents', category: 'navigation', glyph: '☰', keywords: 'toc contents содержание', insert: insert({ type: 'toc' }) },
  { id: 'breadcrumbs', title: 'Хлебные крошки', en: 'Breadcrumbs', category: 'navigation', glyph: '›', keywords: 'breadcrumbs путь', insert: insert({ type: 'breadcrumbs' }) },
  { id: 'anchor', title: 'Якорь', en: 'Anchor', category: 'navigation', glyph: '⚓', keywords: 'anchor метка закладка', insert: (e, r, ctx: InsertContext) => {
    const name = prompt('Имя якоря (латиница, цифры, дефис). Ссылка на него — #имя', '');
    const clean = (name ?? '').trim().toLowerCase().replace(/[^a-z0-9а-яё-]+/gi, '-').replace(/^-+|-+$/g, '');
    e.chain().focus().deleteRange(r).run();
    if (!clean) return ctx.notify('Якорь не добавлен: пустое имя');
    e.chain().focus().insertContent({ type: 'anchor', attrs: { name: clean } }).run();
  } },
];

const soon: BlockDef[] = [
  { id: 'image', title: 'Картинка', en: 'Image', category: 'media', glyph: '🖼', wave: 2, keywords: 'image picture фото' },
  { id: 'gallery', title: 'Галерея', en: 'Gallery', category: 'media', glyph: '▤', wave: 2, keywords: 'gallery images' },
  { id: 'video', title: 'Видео', en: 'Video', category: 'media', glyph: '▶', wave: 2, keywords: 'video youtube' },
  { id: 'audio', title: 'Аудио', en: 'Audio', category: 'media', glyph: '♪', wave: 2, keywords: 'audio sound' },
  { id: 'file', title: 'Файл', en: 'File', category: 'media', glyph: '📎', wave: 2, keywords: 'file attachment вложение' },
  { id: 'pdf', title: 'PDF', en: 'PDF', category: 'media', glyph: 'PDF', wave: 2, keywords: 'pdf document' },
  { id: 'bookmark', title: 'Закладка', en: 'Bookmark', category: 'media', glyph: '🔖', wave: 2, keywords: 'bookmark link preview' },
  { id: 'embed', title: 'Встраивание', en: 'Embed', category: 'media', glyph: '⌘', wave: 2, keywords: 'embed iframe figma youtube' },
  { id: 'equation', title: 'Формула', en: 'Equation', category: 'special', glyph: '∑', wave: 3, keywords: 'math latex katex' },
  { id: 'mermaid', title: 'Диаграмма Mermaid', en: 'Mermaid', category: 'special', glyph: '⧖', wave: 3, keywords: 'diagram flowchart' },
  { id: 'database', title: 'База данных', en: 'Database', category: 'data', glyph: '▦', wave: 4, keywords: 'database inline' },
  { id: 'linked-view', title: 'Связанный вид базы', en: 'Linked view', category: 'data', glyph: '⇄', wave: 4, keywords: 'linked database view' },
  { id: 'spreadsheet', title: 'Таблица с формулами', en: 'Spreadsheet', category: 'data', glyph: 'fx', wave: 4, keywords: 'spreadsheet excel' },
  { id: 'synced', title: 'Синхронизированный блок', en: 'Synced block', category: 'structure', glyph: '⟳', wave: 4, keywords: 'synced' },
  { id: 'button', title: 'Кнопка', en: 'Button', category: 'special', glyph: '⏺', wave: 4, keywords: 'button template action шаблон' },
  { id: 'progress', title: 'Прогресс', en: 'Progress bar', category: 'special', glyph: '▰', wave: 4, keywords: 'progress' },
  { id: 'status', title: 'Статус', en: 'Status', category: 'special', glyph: '◉', wave: 4, keywords: 'status' },
  { id: 'chart', title: 'График', en: 'Chart', category: 'special', glyph: '📈', wave: 4, keywords: 'chart graph диаграмма' },
  { id: 'canvas', title: 'Холст', en: 'Canvas', category: 'special', glyph: '◫', wave: 4, keywords: 'canvas whiteboard' },
  { id: 'graph', title: 'Граф связей', en: 'Graph', category: 'special', glyph: '⋈', wave: 4, keywords: 'graph knowledge' },
  { id: 'mindmap', title: 'Майнд-карта', en: 'Mind map', category: 'special', glyph: '✳', wave: 4, keywords: 'mind map' },
  { id: 'flowchart', title: 'Блок-схема', en: 'Flowchart', category: 'special', glyph: '⇢', wave: 4, keywords: 'flowchart diagram' },
];

for (const b of ready) registerBlock({ ...b, status: 'ready' });
for (const b of soon) registerBlock({ ...b, status: 'soon' });
