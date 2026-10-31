// Блоки волны 2 в меню «/»: заменяют пункты «скоро» из blocks.ts (по тому же id).
import type { Editor, Range } from '@tiptap/core';
import { registerBlock, type BlockDef } from './registry';

const add = (type: string) => (e: Editor, r: Range) => {
  e.chain().focus().deleteRange(r).insertContent({ type }).run();
};

const defs: BlockDef[] = [
  { id: 'image', title: 'Картинка', en: 'Image', category: 'media', glyph: '🖼', keywords: 'image picture photo фото изображение рисунок', insert: add('image') },
  { id: 'gallery', title: 'Галерея', en: 'Gallery', category: 'media', glyph: '▤', keywords: 'gallery images картинки фото сетка', insert: add('gallery') },
  { id: 'video', title: 'Видео', en: 'Video', category: 'media', glyph: '▶', keywords: 'video youtube vimeo ролик', insert: add('video') },
  { id: 'audio', title: 'Аудио', en: 'Audio', category: 'media', glyph: '♪', keywords: 'audio sound music музыка звук подкаст', insert: add('audio') },
  { id: 'file', title: 'Файл', en: 'File', category: 'media', glyph: '📎', keywords: 'file attachment вложение документ', insert: add('file') },
  { id: 'pdf', title: 'PDF', en: 'PDF', category: 'media', glyph: 'PDF', keywords: 'pdf document документ', insert: add('pdf') },
  { id: 'bookmark', title: 'Закладка', en: 'Bookmark', category: 'media', glyph: '🔖', keywords: 'bookmark link preview ссылка сайт превью', insert: add('bookmark') },
  { id: 'embed', title: 'Встраивание', en: 'Embed', category: 'media', glyph: '⌘', keywords: 'embed iframe figma youtube google docs spotify', insert: add('embed') },
];

for (const d of defs) registerBlock({ ...d, status: 'ready' });
