// Волна 4 (то, что не требует базы данных): прогресс, статус, кнопка, график, блок-схема, майнд-карта.
import { mergeAttributes, Node, type Editor, type Range } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { registerBlock } from './registry';
import './wave4.css';

const COLORS = ['gray', 'blue', 'green', 'yellow', 'red'] as const;

function ProgressView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const v = Math.max(0, Math.min(100, Number(node.attrs.value) || 0));
  return (
    <NodeViewWrapper className="w4 w4-progress" contentEditable={false}>
      <div className="w4-row">
        <div className="w4-track" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
          <div className="w4-fill" style={{ width: `${v}%` }} />
        </div>
        <input type="number" min={0} max={100} value={v} onChange={(e) => updateAttributes({ value: Number(e.target.value) })} aria-label="Процент" />
        <span>%</span>
        <button className="w4-x" onClick={deleteNode} aria-label="Убрать блок">×</button>
      </div>
    </NodeViewWrapper>
  );
}

function StatusView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const c = COLORS.includes(node.attrs.color) ? node.attrs.color : 'gray';
  const next = () => updateAttributes({ color: COLORS[(COLORS.indexOf(c) + 1) % COLORS.length] });
  return (
    <NodeViewWrapper className="w4 w4-status" contentEditable={false}>
      <div className="w4-row">
        <button className={`w4-pill c-${c}`} onClick={next} title="Нажмите, чтобы сменить цвет">
          <input
            value={node.attrs.label ?? ''}
            placeholder="Статус"
            aria-label="Текст статуса"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateAttributes({ label: e.target.value })}
          />
        </button>
        <button className="w4-x" onClick={deleteNode} aria-label="Убрать блок">×</button>
      </div>
    </NodeViewWrapper>
  );
}

function ButtonView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const run = () => {
    const text = (node.attrs.text ?? '').trim();
    if (!text) return;
    const pos = editor.state.doc.content.size;
    editor.chain().insertContentAt(pos, { type: 'paragraph', content: [{ type: 'text', text }] }).run();
  };
  return (
    <NodeViewWrapper className="w4 w4-button" contentEditable={false}>
      <div className="w4-btn-edit">
        <input value={node.attrs.label ?? ''} onChange={(e) => updateAttributes({ label: e.target.value })} placeholder="Название кнопки" aria-label="Название кнопки" />
        <input value={node.attrs.text ?? ''} onChange={(e) => updateAttributes({ text: e.target.value })} placeholder="Текст, который добавляет кнопка в конец заметки" aria-label="Текст кнопки" />
        <button className="w4-x" onClick={deleteNode} aria-label="Убрать блок">×</button>
      </div>
      <button className="w4-btn" onClick={run}>{node.attrs.label || 'Нажать'}</button>
    </NodeViewWrapper>
  );
}

export const ProgressNode = Node.create({
  name: 'progress', group: 'block', atom: true, selectable: true,
  addAttributes: () => ({ value: { default: 0 } }),
  parseHTML: () => [{ tag: 'div[data-w4="progress"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-w4': 'progress' })],
  addNodeView: () => ReactNodeViewRenderer(ProgressView),
});

export const StatusNode = Node.create({
  name: 'status', group: 'block', atom: true, selectable: true,
  addAttributes: () => ({ label: { default: '' }, color: { default: 'gray' } }),
  parseHTML: () => [{ tag: 'div[data-w4="status"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-w4': 'status' })],
  addNodeView: () => ReactNodeViewRenderer(StatusView),
});

export const ButtonNode = Node.create({
  name: 'actionButton', group: 'block', atom: true, selectable: true,
  addAttributes: () => ({ label: { default: 'Нажать' }, text: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-w4="button"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-w4': 'button' })],
  addNodeView: () => ReactNodeViewRenderer(ButtonView),
});

export const WAVE4_NODES = [ProgressNode, StatusNode, ButtonNode];

const attrs = (type: string, a: Record<string, unknown>) => (e: Editor, r: Range) => {
  e.chain().focus().deleteRange(r).insertContent({ type, attrs: a }).run();
};
const mermaid = (code: string) => (e: Editor, r: Range) => {
  e.chain().focus().deleteRange(r).insertContent({ type: 'mermaid', attrs: { code } }).run();
};

registerBlock({ id: 'progress', title: 'Прогресс', en: 'Progress bar', category: 'special', glyph: '▰', status: 'ready', keywords: 'progress прогресс процент полоска', insert: attrs('progress', { value: 0 }) });
registerBlock({ id: 'status', title: 'Статус', en: 'Status', category: 'special', glyph: '◉', status: 'ready', keywords: 'status статус метка цвет', insert: attrs('status', { label: '', color: 'gray' }) });
registerBlock({ id: 'button', title: 'Кнопка', en: 'Button', category: 'special', glyph: '⏺', status: 'ready', keywords: 'button кнопка действие добавить текст', insert: attrs('actionButton', { label: 'Нажать', text: '' }) });
registerBlock({ id: 'chart', title: 'График', en: 'Chart', category: 'special', glyph: '📈', status: 'ready', keywords: 'chart график диаграмма столбцы', insert: mermaid('xychart-beta\n  title "Название"\n  x-axis [Янв, Фев, Мар]\n  bar [3, 5, 4]') });
registerBlock({ id: 'flowchart', title: 'Блок-схема', en: 'Flowchart', category: 'special', glyph: '⇢', status: 'ready', keywords: 'flowchart блок-схема схема процесс', insert: mermaid('flowchart TD\n  A[Начало] --> B{Условие}\n  B -->|да| C[Шаг]\n  B -->|нет| D[Конец]') });
registerBlock({ id: 'mindmap', title: 'Майнд-карта', en: 'Mind map', category: 'special', glyph: '✳', status: 'ready', keywords: 'mind map майнд карта мысли', insert: mermaid('mindmap\n  root((Тема))\n    Идея 1\n    Идея 2') });
