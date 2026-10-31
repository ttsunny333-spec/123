// Свойства заметки под заголовком + форма «Новое свойство».
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createPropertyDef, propsFor } from '../../core/properties';
import type { Obj, PropertyKind } from '../../core/types';
import { useApp } from '../../state/store';
import { CREATABLE_KINDS, KIND_LABEL, PropCell } from './PropCell';

export function AddPropForm({ systemId, appliesTo, onDone }: { systemId: string; appliesTo: string[] | null; onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PropertyKind>('text');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const st = useApp.getState();
    const r = createPropertyDef(st.data, { systemId, name: n, kind, appliesTo });
    if (st.commit('Новое свойство', r.ops)) onDone();
  };
  return (
    <form className="pr-add-form" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название свойства" aria-label="Название свойства" autoFocus />
      <select value={kind} onChange={(e) => setKind(e.target.value as PropertyKind)} aria-label="Тип свойства">
        {CREATABLE_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <button className="btn primary small" disabled={!name.trim()}>
        Создать
      </button>
      <button type="button" className="btn ghost small" onClick={onDone}>
        Отмена
      </button>
    </form>
  );
}

export function PropsPanel({ obj }: { obj: Obj }) {
  const data = useApp((s) => s.data);
  const defs = propsFor(data, obj);
  const [adding, setAdding] = useState(false);
  return (
    <div className="pr-panel">
      {defs.map((d) => (
        <div className="pr-row" key={d.id}>
          <span className="pr-name" title={d.name}>
            {d.name}
          </span>
          <div className="pr-val">
            <PropCell def={d} obj={obj} />
          </div>
        </div>
      ))}
      {adding ? (
        <AddPropForm systemId={obj.systemId} appliesTo={[obj.type]} onDone={() => setAdding(false)} />
      ) : (
        <button className="pr-add" onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden /> Свойство
        </button>
      )}
    </div>
  );
}
