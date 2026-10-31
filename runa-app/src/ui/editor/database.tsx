// Блок «База данных»: страница-хозяин + свой тип записей + табличный вид.
// Колонки привязаны к типу базы, поэтому не появляются в остальных заметках.
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { createObject, deleteObjectForever, updateObject } from '../../core/commands';
import { deletePropertyDef } from '../../core/properties';
import { createObjectType } from '../../core/schema';
import type { Obj, ViewRec } from '../../core/types';
import { createView, updateView, viewColumns, viewObjects } from '../../core/views';
import { useApp } from '../../state/store';
import { openNote } from '../nav';
import { PropCell } from '../props/PropCell';
import { AddPropForm } from '../props/PropsPanel';
import { registerBlock } from './registry';

function DatabaseView({ node, deleteNode }: NodeViewProps) {
  const data = useApp((s) => s.data);
  const [adding, setAdding] = useState(false);
  const host = data.objects[node.attrs.hostId as string];
  const view = data.views[node.attrs.viewId as string];
  if (!host || !view) {
    return (
      <NodeViewWrapper className="md" contentEditable={false}>
        <div className="md-fail">
          База данных удалена.
          <button className="md-link" onClick={deleteNode}>
            Убрать блок
          </button>
        </div>
      </NodeViewWrapper>
    );
  }
  const typeId = view.config.newType ?? 'page';
  const rows = viewObjects(data, view);
  const cols = viewColumns(data, view, rows).filter((c) => c.appliesTo?.includes(typeId));
  const sort = view.config.sort;

  const toggleSort = (key: string) => {
    const st = useApp.getState();
    const next = sort?.key !== key ? { key, dir: 'asc' as const } : sort.dir === 'asc' ? { key, dir: 'desc' as const } : null;
    st.commit('Сортировка', updateView(st.data, view.id, { config: { sort: next } }));
  };
  const addRow = () => {
    const st = useApp.getState();
    st.commit('Новая строка', createObject(st.data, { systemId: host.systemId, parentId: host.id, type: typeId, title: '' }).ops);
  };
  const removeRow = (r: Obj) => {
    const st = useApp.getState();
    if (st.commit('Удаление строки', deleteObjectForever(st.data, r.id))) st.notify(`Удалено: ${r.title.trim() || 'строка'}`);
  };
  const removeCol = (id: string, name: string) => {
    if (!confirm(`Удалить колонку «${name}»? Значения в строках пропадут из таблицы.`)) return;
    const st = useApp.getState();
    st.commit('Удаление колонки', deletePropertyDef(st.data, id));
  };

  return (
    <NodeViewWrapper className="md db" contentEditable={false}>
      <div className="db-head">
        <input
          className="db-title"
          value={host.title}
          placeholder="База данных"
          aria-label="Название базы данных"
          onChange={(e) => {
            const st = useApp.getState();
            st.commit('Название базы', updateObject(st.data, host.id, { title: e.target.value }), { mergeKey: `title:${host.id}` });
          }}
        />
        <button className="db-icon" onClick={() => openNote(host.id)} aria-label="Открыть как страницу" title="Открыть как страницу">
          <ExternalLink size={15} aria-hidden />
        </button>
        <button className="db-icon" onClick={deleteNode} aria-label="Убрать блок (данные останутся)" title="Убрать блок (данные останутся)">
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="db-scroll">
        <table className="db-table">
          <thead>
            <tr>
              <th className="db-first">Название</th>
              {cols.map((c) => (
                <th key={c.id}>
                  <button className="db-th" onClick={() => toggleSort(c.id)} title="Сортировать">
                    {c.name}
                    {sort?.key === c.id && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                  </button>
                  <button className="db-colx" onClick={() => removeCol(c.id, c.name)} aria-label={`Удалить колонку «${c.name}»`}>
                    <X size={11} aria-hidden />
                  </button>
                </th>
              ))}
              <th className="db-plus">
                <button onClick={() => setAdding(!adding)} aria-label="Добавить колонку" title="Добавить колонку">
                  <Plus size={14} aria-hidden />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="db-first">
                  <div className="db-name">
                    <input
                      value={r.title}
                      placeholder="Без названия"
                      aria-label="Название строки"
                      onChange={(e) => {
                        const st = useApp.getState();
                        st.commit('Название строки', updateObject(st.data, r.id, { title: e.target.value }), { mergeKey: `title:${r.id}` });
                      }}
                    />
                    <button onClick={() => openNote(r.id)} aria-label="Открыть строку" title="Открыть">
                      <ExternalLink size={13} aria-hidden />
                    </button>
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.id}>
                    <PropCell def={c} obj={r} />
                  </td>
                ))}
                <td className="db-plus">
                  <button className="db-rowx" onClick={() => removeRow(r)} aria-label="Удалить строку" title="Удалить строку">
                    <X size={13} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <AddPropForm systemId={host.systemId} appliesTo={[typeId]} onDone={() => setAdding(false)} />}
      <button className="db-new" onClick={addRow}>
        <Plus size={14} aria-hidden /> Новая строка
      </button>
    </NodeViewWrapper>
  );
}

export const DatabaseNode = Node.create({
  name: 'database',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ hostId: { default: null }, viewId: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-md="database"]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-md': 'database' })],
  addNodeView: () => ReactNodeViewRenderer(DatabaseView),
});

export const DATABASE_NODES = [DatabaseNode];

registerBlock({
  id: 'database',
  title: 'База данных',
  en: 'Database',
  category: 'data',
  glyph: '▦',
  status: 'ready',
  keywords: 'database таблица база данных строки колонки свойства',
  insert: (editor, range, ctx) => {
    const st = useApp.getState();
    const type = createObjectType(st.data, ctx.systemId, 'Запись');
    const page = createObject(st.data, { systemId: ctx.systemId, parentId: ctx.noteId, type: 'page', title: 'База данных' });
    const v = createView(st.data, { systemId: ctx.systemId, hostId: page.id, kind: 'table' });
    const row = (v.ops[0] as { row: ViewRec }).row;
    row.config = { ...row.config, types: [type.id], newType: type.id };
    if (!st.commit('База данных', [...type.ops, ...page.ops, ...v.ops])) return;
    editor.chain().focus().deleteRange(range).insertContent({ type: 'database', attrs: { hostId: page.id, viewId: v.id } }).run();
  },
});
