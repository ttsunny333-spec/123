// Редактор значения свойства: один компонент на все виды (текст, число, выбор, дата, флажок, ссылка…).
import { X } from 'lucide-react';
import { setPropValue, addSelectOption, optionById } from '../../core/properties';
import type { Obj, PropertyDef, PropertyKind } from '../../core/types';
import { useApp } from '../../state/store';
import './props.css';

export const KIND_LABEL: Record<PropertyKind, string> = {
  text: 'Текст',
  number: 'Число',
  select: 'Выбор',
  multi_select: 'Несколько вариантов',
  date: 'Дата',
  checkbox: 'Флажок',
  url: 'Ссылка',
  relation: 'Связь',
};
/** Виды, которые можно создавать из интерфейса (связи появятся вместе с графом). */
export const CREATABLE_KINDS: PropertyKind[] = ['text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url'];

export function setValue(objId: string, propId: string, v: unknown) {
  const st = useApp.getState();
  st.commit('Свойство', setPropValue(st.data, objId, propId, v), { mergeKey: `prop:${objId}:${propId}` });
}

function newOption(def: PropertyDef): string | null {
  const name = prompt(`Новый вариант для «${def.name}»`)?.trim();
  if (!name) return null;
  const st = useApp.getState();
  const r = addSelectOption(st.data, def.id, name);
  return st.commit('Вариант', r.ops) ? r.optionId : null;
}

export function PropCell({ def, obj }: { def: PropertyDef; obj: Obj }) {
  const data = useApp((s) => s.data);
  const value = obj.props[def.id];
  const set = (v: unknown) => setValue(obj.id, def.id, v);

  switch (def.kind) {
    case 'checkbox':
      return <input type="checkbox" className="pc-check" checked={value === true} onChange={(e) => set(e.target.checked)} aria-label={def.name} />;
    case 'number':
      return (
        <input
          className="pc-in"
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))}
          aria-label={def.name}
        />
      );
    case 'date':
      return <input className="pc-in" type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value || null)} aria-label={def.name} />;
    case 'url':
      return (
        <span className="pc-url">
          <input className="pc-in" value={typeof value === 'string' ? value : ''} placeholder="https://…" onChange={(e) => set(e.target.value || null)} aria-label={def.name} />
          {typeof value === 'string' && /^https?:\/\//i.test(value) && (
            <a href={value} target="_blank" rel="noopener noreferrer" aria-label="Открыть ссылку">
              ↗
            </a>
          )}
        </span>
      );
    case 'select': {
      const opts = def.config.options ?? [];
      const cur = optionById(def, value);
      return (
        <select
          className={`pc-in pc-select${cur ? ` opt-${cur.color}` : ''}`}
          value={cur?.id ?? ''}
          aria-label={def.name}
          onChange={(e) => {
            if (e.target.value === '__new') {
              const id = newOption(def);
              if (id) set(id);
            } else set(e.target.value || null);
          }}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="__new">＋ Новый вариант…</option>
        </select>
      );
    }
    case 'multi_select': {
      const ids: string[] = Array.isArray(value) ? (value as string[]) : [];
      const opts = def.config.options ?? [];
      return (
        <span className="pc-multi">
          {ids.map((id) => {
            const o = optionById(def, id);
            return o ? (
              <span key={id} className={`pc-chip opt-${o.color}`}>
                {o.name}
                <button onClick={() => set(ids.filter((x) => x !== id))} aria-label={`Убрать «${o.name}»`}>
                  <X size={11} aria-hidden />
                </button>
              </span>
            ) : null;
          })}
          <select
            className="pc-add"
            value=""
            aria-label={`Добавить: ${def.name}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__new') {
                const id = newOption(def);
                if (id) set([...ids, id]);
              } else if (v) set([...ids, v]);
            }}
          >
            <option value="">＋</option>
            {opts
              .filter((o) => !ids.includes(o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            <option value="__new">Новый вариант…</option>
          </select>
        </span>
      );
    }
    case 'relation': {
      const ids: string[] = Array.isArray(value) ? (value as string[]) : typeof value === 'string' ? [value] : [];
      return <span className="pc-ro">{ids.map((i) => data.objects[i]?.title || 'Без названия').join(', ') || '—'}</span>;
    }
    default:
      return <input className="pc-in" value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value || null)} aria-label={def.name} />;
  }
}
