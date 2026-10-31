// Волна 3: формулы (KaTeX) и диаграммы (Mermaid). Библиотеки грузятся только когда блок на странице.
import { mergeAttributes, Node, type Editor, type Range } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { registerBlock } from './registry';

let katexP: Promise<typeof import('katex')> | null = null;
const loadKatex = () => (katexP ??= import('katex').then((m) => m.default ? m : m));
let mermaidP: Promise<{ render: (id: string, code: string) => Promise<{ svg: string }> }> | null = null;
const loadMermaid = () =>
  (mermaidP ??= import('mermaid').then((mod) => {
    const lib = (mod as unknown as { default: { initialize: (c: object) => void; render: (id: string, code: string) => Promise<{ svg: string }> } }).default;
    lib.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'inherit' });
    return lib;
  }));

/** Формула: LaTeX в блоке. Ошибку синтаксиса показывает текстом, а не роняет страницу. */
function EquationView({ node, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(!node.attrs.tex);
  const [html, setHtml] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const tex: string = node.attrs.tex ?? '';

  useEffect(() => {
    if (!tex.trim()) return;
    let off = false;
    loadKatex().then((k) => {
      if (off) return;
      try {
        setHtml(k.default.renderToString(tex, { displayMode: true, throwOnError: true, output: 'html' }));
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
    return () => {
      off = true;
    };
  }, [tex]);

  if (editing || !tex.trim()) {
    return (
      <NodeViewWrapper className="md md-math" contentEditable={false}>
        <textarea
          className="math-src"
          value={tex}
          autoFocus
          placeholder="Формула в LaTeX, например: E = mc^2 или \frac{a}{b}"
          aria-label="Формула в LaTeX"
          onChange={(e) => updateAttributes({ tex: e.target.value })}
          onBlur={() => tex.trim() && setEditing(false)}
          rows={2}
        />
        {err && (
          <div className="md-err" role="alert">
            Ошибка в формуле: {err}
          </div>
        )}
        {tex.trim() && (
          <button className="md-link" onClick={() => setEditing(false)}>
            Готово
          </button>
        )}
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className="md md-math" contentEditable={false} onDoubleClick={() => setEditing(true)} title="Двойной клик — изменить">
      {err ? (
        <div className="md-err" role="alert">
          Ошибка в формуле: {err}
        </div>
      ) : (
        <div className="math-out" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}

export const EquationNode = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ tex: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-equation]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-equation': '' })],
  addNodeView: () => ReactNodeViewRenderer(EquationView),
});

/** Диаграмма Mermaid: код слева-сверху, результат ниже. Ошибка синтаксиса показывается текстом. */
function MermaidView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [editing, setEditing] = useState(!node.attrs.code);
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const code: string = node.attrs.code ?? '';
  const holder = useRef<HTMLDivElement>(null);
  const uid = useRef(`mmd-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (editing || !code.trim()) return;
    let off = false;
    const t = setTimeout(() => {
      loadMermaid()
        .then((m) => m.render(uid.current, code))
        .then((r) => {
          if (off) return;
          setSvg(r.svg);
          setErr(null);
        })
        .catch((e) => {
          if (off) return;
          setErr((e as Error).message?.split('\n')[0] ?? 'не удалось построить');
          setSvg('');
        });
    }, 300);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [code, editing]);

  return (
    <NodeViewWrapper className="md md-mermaid" contentEditable={false}>
      <div className="mmd-bar">
        <span className="md-hint">Диаграмма</span>
        <span className="grow" />
        <button onClick={() => setEditing(!editing)}>{editing ? 'Готово' : 'Изменить код'}</button>
        <button onClick={deleteNode} aria-label="Убрать блок">
          Убрать
        </button>
      </div>
      {editing ? (
        <textarea
          className="math-src mono"
          value={code}
          autoFocus
          spellCheck={false}
          placeholder={'flowchart TD\n  A[Начало] --> B{Решение}\n  B -->|да| C[Готово]'}
          aria-label="Код диаграммы"
          onChange={(e) => updateAttributes({ code: e.target.value })}
          rows={6}
        />
      ) : err ? (
        <div className="md-err" role="alert">
          Ошибка в диаграмме: {err}
        </div>
      ) : (
        <div ref={holder} className="mmd-out" dangerouslySetInnerHTML={{ __html: svg || '<span class="md-hint">Строю диаграмму…</span>' }} />
      )}
    </NodeViewWrapper>
  );
}

export const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ code: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-mermaid]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-mermaid': '' })],
  addNodeView: () => ReactNodeViewRenderer(MermaidView),
});

export const MATH_NODES = [EquationNode, MermaidNode];

const insertNode = (type: string, attrs: Record<string, unknown>) => (e: Editor, r: Range) => {
  e.chain().focus().deleteRange(r).insertContent({ type, attrs }).run();
};

registerBlock({ id: 'equation', title: 'Формула', en: 'Equation', category: 'special', glyph: '∑', status: 'ready', keywords: 'math latex katex формула уравнение', insert: insertNode('equation', { tex: '' }) });
registerBlock({ id: 'mermaid', title: 'Диаграмма Mermaid', en: 'Mermaid', category: 'special', glyph: '⧖', status: 'ready', keywords: 'diagram flowchart mermaid диаграмма схема блок-схема', insert: insertNode('mermaid', { code: '' }) });
