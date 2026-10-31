// Реестр блоков редактора. Меню «/» строится только отсюда; новые инструменты
// добавляют свои блоки через registerBlock — основу редактора менять не нужно.
import type { Editor, Range } from '@tiptap/core';
import type { Id } from '../../core/types';

export type BlockCategory = 'text' | 'structure' | 'media' | 'data' | 'special' | 'navigation';

export const CATEGORY_TITLE: Record<BlockCategory, string> = {
  text: 'Текст',
  structure: 'Структура',
  media: 'Медиа и вложения',
  data: 'Таблицы и данные',
  special: 'Специальные',
  navigation: 'Навигация',
};
export const CATEGORY_ORDER: BlockCategory[] = ['text', 'structure', 'data', 'navigation', 'media', 'special'];

/** Что знает блок о месте, куда его вставляют. */
export interface InsertContext {
  noteId: Id;
  systemId: Id;
  /** Создаёт вложенную заметку и возвращает её id. */
  createChild: () => Id | null;
  /** Следующий выбор в списке «@» вставит не упоминание, а блок указанного вида. */
  pickNext: (mode: 'pageLink' | 'pageEmbed') => void;
  notify: (text: string) => void;
}

export interface BlockDef {
  id: string;
  title: string;
  /** Английское название — тоже ищется через «/». */
  en: string;
  category: BlockCategory;
  keywords?: string;
  /** Короткий значок для плитки в меню. */
  glyph: string;
  hint?: string;
  /** «soon» — блок запланирован, в меню виден с пометкой. */
  status?: 'ready' | 'soon';
  wave?: number;
  insert?: (editor: Editor, range: Range, ctx: InsertContext) => void;
}

const blocks: BlockDef[] = [];

export function registerBlock(def: BlockDef) {
  const i = blocks.findIndex((b) => b.id === def.id);
  if (i >= 0) blocks[i] = def;
  else blocks.push(def);
}

export function allBlocks(): BlockDef[] {
  return blocks;
}

/** Поиск по названию, английскому названию, id и ключевым словам. Сначала — совпадения с начала слова. */
export function searchBlocks(query: string): BlockDef[] {
  const q = query.trim().toLowerCase();
  const ordered = CATEGORY_ORDER.flatMap((c) => blocks.filter((b) => b.category === c));
  if (!q) return ordered;
  const scored = ordered
    .map((b) => {
      const words = `${b.title} ${b.en} ${b.id} ${b.keywords ?? ''}`.toLowerCase();
      if (!words.includes(q)) return null;
      const starts = words.split(/[\s/()-]+/).some((w) => w.startsWith(q));
      const readyBonus = b.status === 'soon' ? 0 : 2;
      return { b, score: (starts ? 2 : 0) + readyBonus };
    })
    .filter((x): x is { b: BlockDef; score: number } => !!x);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.b);
}
