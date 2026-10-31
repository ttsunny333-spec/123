import { ChevronLeft, ChevronRight, Ellipsis, FileText, House, SquarePen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteObjectForever, updateObject } from '../core/commands';
import { ancestors, childrenOf, descendants } from '../core/queries';
import type { Id, Obj } from '../core/types';
import { useApp } from '../state/store';
import { ICON_PROP } from './NoteHeader';
import { createNote, useNotes } from './notes';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ExchangeButtons } from './Exchange';

export type Page = { kind: 'home' } | { kind: 'note'; id: Id };

/** Левая панель: «Главная», новая заметка, список заметок с меню «⋯». */
/** Открыта ли панель (на телефоне по умолчанию закрыта). Переключается из шапки страниц. */
export const sidebarOpen = { value: typeof window !== 'undefined' ? window.innerWidth > 760 : true, listeners: new Set<() => void>() };
export function setSidebarOpen(v: boolean) {
  sidebarOpen.value = v;
  sidebarOpen.listeners.forEach((f) => f());
}

export function Sidebar({ space, page, go }: { space: Id | null; page: Page; go: (p: Page) => void }) {
  const [open, setOpen] = useState(sidebarOpen.value);
  useEffect(() => {
    const f = () => setOpen(sidebarOpen.value);
    sidebarOpen.listeners.add(f);
    return () => {
      sidebarOpen.listeners.delete(f);
    };
  }, []);
  // На телефоне после перехода по заметке панель закрывается сама.
  const choose = (p: Page) => {
    go(p);
    if (window.innerWidth <= 760) setSidebarOpen(false);
  };
  const notes = useNotes(space);
  const loading = useApp((s) => (space ? s.systemLoad[space] !== 'ready' : true));
  const [editing, setEditing] = useState<Id | null>(null);
  const [menuFor, setMenuFor] = useState<Id | null>(null);
  const data = useApp((s) => s.data);
  // Предки открытой заметки раскрыты в дереве автоматически.
  const openPath = new Set(page.kind === 'note' && data.objects[page.id] ? ancestors(data, page.id).map((o) => o.id) : []);

  const add = () => {
    if (!space) return;
    const id = createNote(space);
    if (id) {
      go({ kind: 'note', id });
      setEditing(id);
    }
  };

  const remove = (n: Obj) => {
    const st = useApp.getState();
    const inside = descendants(st.data, n.id).length;
    const name = n.title.trim() || 'Без названия';
    if (!confirm(inside ? `Удалить «${name}» и ещё ${inside} вложенных?` : `Удалить «${name}»?`)) return;
    if (st.commit('Удаление заметки', deleteObjectForever(st.data, n.id))) {
      if (page.kind === 'note' && page.id === n.id) go({ kind: 'home' });
      st.notify(`Удалено: ${name}`);
    }
  };

  return (
    <>
    {open && <div className="sb-scrim" onClick={() => setSidebarOpen(false)} aria-hidden />}
    <aside className={open ? 'sidebar open' : 'sidebar'} aria-label="Навигация">
      <div className="sb-top">
        <button className="sb-brand" onClick={() => choose({ kind: 'home' })} aria-label="Перейти на главную" title="Главная">
          <span className="sb-mark" aria-hidden>
            ᚱ
          </span>
          Runa
        </button>
        <button className="icon-btn sb-hide" onClick={() => setSidebarOpen(false)} aria-label="Скрыть панель" title="Скрыть панель">
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button className="icon-btn" onClick={add} disabled={!space} aria-label="Новая заметка" title="Новая заметка">
          <SquarePen size={17} aria-hidden />
        </button>
      </div>

      <nav className="sb-nav">
        <button className={page.kind === 'home' ? 'sb-item on' : 'sb-item'} onClick={() => choose({ kind: 'home' })}>
          <House size={16} aria-hidden /> Главная
        </button>
      </nav>

      <div className="sb-section">Заметки</div>
      <ul className="sb-list">
        {notes.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            depth={0}
            page={page}
            go={go}
            editing={editing}
            setEditing={setEditing}
            menuFor={menuFor}
            setMenuFor={setMenuFor}
            remove={remove}
            openPath={openPath}
            choose={choose}
          />
        ))}
      </ul>
      {!loading && notes.length === 0 && <p className="sb-empty">Пока пусто</p>}
      <ExchangeButtons space={space} />
      <ThemeSwitcher />
    </aside>
    </>
  );
}

interface RowProps {
  note: Obj;
  depth: number;
  page: Page;
  go: (p: Page) => void;
  editing: Id | null;
  setEditing: (id: Id | null) => void;
  menuFor: Id | null;
  setMenuFor: (id: Id | null) => void;
  remove: (n: Obj) => void;
  openPath: Set<Id>;
  choose: (p: Page) => void;
}

/** Строка дерева заметок: стрелка для вложенных, название, «⋯». */
function NoteRow(props: RowProps) {
  const { note: n, depth, page, go, editing, setEditing, menuFor, setMenuFor, remove, openPath, choose } = props;
  const objects = useApp((s) => s.data.objects);
  const kids = childrenOf(objects, n.systemId, n.id);
  const [expanded, setExpanded] = useState(false);
  const open = expanded || openPath.has(n.id);
  const active = page.kind === 'note' && page.id === n.id;
  const indent = { paddingLeft: 8 + depth * 14 + (kids.length ? 18 : 0) };
  return (
    <li>
      <div className={kids.length ? 'sb-row has-chev' : 'sb-row'}>
        {kids.length > 0 && (
          <button
            className={open ? 'sb-chev open' : 'sb-chev'}
            style={{ left: 3 + depth * 14 }}
            onClick={() => setExpanded(!open)}
            aria-label={open ? 'Свернуть' : 'Развернуть'}
            aria-expanded={open}
          >
            <ChevronRight size={13} aria-hidden />
          </button>
        )}
        {editing === n.id ? (
          <input
            className="sb-rename"
            style={{ marginLeft: depth * 14 }}
            autoFocus
            defaultValue={n.title}
            placeholder="Без названия"
            aria-label="Название заметки"
            onBlur={(e) => {
              const st = useApp.getState();
              const v = e.target.value.trim();
              if (v !== n.title) st.commit('Название заметки', updateObject(st.data, n.id, { title: v }));
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        ) : (
          <>
            <button
              className={active ? 'sb-item on' : 'sb-item'}
              style={indent}
              onClick={() => choose({ kind: 'note', id: n.id })}
              onDoubleClick={() => setEditing(n.id)}
            >
              {typeof n.props[ICON_PROP] === 'string' ? (
                <span className="sb-emoji" aria-hidden>
                  {n.props[ICON_PROP] as string}
                </span>
              ) : (
                <FileText size={16} aria-hidden />
              )}
              <span className="sb-text">{n.title.trim() || 'Без названия'}</span>
            </button>
            <button
              className={menuFor === n.id ? 'sb-more open' : 'sb-more'}
              aria-label={`Действия с «${n.title.trim() || 'Без названия'}»`}
              aria-haspopup="menu"
              onClick={() => setMenuFor(menuFor === n.id ? null : n.id)}
            >
              <Ellipsis size={15} aria-hidden />
            </button>
            {menuFor === n.id && (
              <RowMenu
                onClose={() => setMenuFor(null)}
                onRename={() => {
                  setMenuFor(null);
                  setEditing(n.id);
                }}
                onDelete={() => {
                  setMenuFor(null);
                  remove(n);
                }}
              />
            )}
          </>
        )}
      </div>
      {open && kids.length > 0 && (
        <ul className="sb-sub">
          {kids.map((k) => (
            <NoteRow key={k.id} {...props} note={k} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function RowMenu({ onClose, onRename, onDelete }: { onClose: () => void; onRename: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    ref.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div className="row-menu" role="menu" ref={ref}>
      <button role="menuitem" onClick={onRename}>
        Переименовать
      </button>
      <button role="menuitem" className="danger" onClick={onDelete}>
        Удалить
      </button>
    </div>
  );
}
