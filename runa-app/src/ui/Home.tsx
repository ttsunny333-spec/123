import { FileText, Plus } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useApp } from '../state/store';
import { ICON_PROP } from './NoteHeader';
import { createNote, useNotes, useNotesSpace } from './notes';
import { ancestors, childrenOf } from '../core/queries';
import type { Obj } from '../core/types';
import { openNote } from './nav';

const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Главная: недавние заметки сверху и все заметки списком по центру, как в Notion. */
export function Home() {
  const space = useNotesSpace();
  const data = useApp((s) => s.data);
  const all = useNotes(space);
  const recent = useMemo(() => {
    const list = Object.values(data.objects) as Obj[];
    return list
      .filter((o) => o.systemId === space && !o.archivedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6);
  }, [data.objects, space]);
  const crumb = (o: Obj) => ancestors(data, o.id).map((a: Obj) => a.title.trim() || 'Без названия').join(' › ');
  const add = () => {
    if (!space) return;
    const id = createNote(space);
    if (id) openNote(id);
  };
  const icon = (o: Obj) =>
    typeof o.props[ICON_PROP] === 'string' ? <span className="ed-emoji" aria-hidden>{o.props[ICON_PROP] as string}</span> : <FileText size={16} aria-hidden />;

  return (
    <main className="main">
      <div className="home">
        <h1>Заметки</h1>

        {recent.length > 0 && (
          <section className="home-block">
            <h2>Недавние</h2>
            <ul className="home-list">
              {recent.map((o) => (
                <li key={o.id}>
                  <HomeRow o={o} icon={icon(o)} sub={crumb(o)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="home-block">
          <div className="home-head">
            <h2>Все заметки</h2>
            <button className="btn primary" onClick={add} disabled={!space}>
              <Plus size={15} aria-hidden /> Новая заметка
            </button>
          </div>
          {all.length === 0 ? (
            <p className="home-empty">Заметок пока нет. Нажмите «Новая заметка» или значок карандаша слева.</p>
          ) : (
            <ul className="home-list">
              {all.map((o) => (
                <li key={o.id}>
                  <HomeRow o={o} icon={icon(o)} sub={childrenOf(data.objects, o.systemId, o.id).length ? `${childrenOf(data.objects, o.systemId, o.id).length} вложенных` : fmt.format(new Date(o.updatedAt))} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function HomeRow({ o, icon, sub }: { o: Obj; icon: ReactNode; sub: string }) {
  return (
    <button className="home-row" onClick={() => openNote(o.id)}>
      {icon}
      <span className="home-name">{o.title.trim() || 'Без названия'}</span>
      <span className="home-sub">{sub}</span>
    </button>
  );
}
