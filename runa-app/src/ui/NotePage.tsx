import { FileText } from 'lucide-react';
import { useMemo } from 'react';
import { updateObject } from '../core/commands';
import type { Id } from '../core/types';
import { useApp } from '../state/store';
import { BlockEditor } from './editor/Editor';
import { ErrorBoundary } from './ErrorBoundary';
import { openNote } from './nav';
import { ICON_PROP, NoteCover, NoteHeader } from './NoteHeader';
import { PropsPanel } from './props/PropsPanel';

/** Страница заметки: заголовок и текст. Всё сохраняется само. */
export function NotePage({ id }: { id: Id }) {
  const note = useApp((s) => s.data.objects[id]);
  if (!note) return <p className="note-missing">Заметка не найдена — возможно, её удалили.</p>;
  return (
    <div key={id}>
      <NoteCover note={note} />
      <article className="note">
        <NoteHeader note={note}>
      <input
        className="note-title"
        value={note.title}
        placeholder="Без названия"
        aria-label="Название заметки"
        onChange={(e) => {
          const st = useApp.getState();
          st.commit('Название заметки', updateObject(st.data, id, { title: e.target.value }), { mergeKey: `title:${id}` });
        }}
      />
        </NoteHeader>
        <PropsPanel obj={note} />
        <ErrorBoundary label="Редактор">
          <BlockEditor key={id} noteId={id} />
        </ErrorBoundary>
        <Backlinks id={id} />
      </article>
    </div>
  );
}

/** «Упоминается в»: заметки, где есть @упоминание, ссылка или окно этой заметки. */
function Backlinks({ id }: { id: Id }) {
  const objects = useApp((s) => s.data.objects);
  const refs = useMemo(() => {
    const hits = (n: unknown): boolean => {
      if (!n || typeof n !== 'object') return false;
      const node = n as { type?: string; attrs?: { id?: string }; content?: unknown[] };
      if ((node.type === 'mention' || node.type === 'pageLink' || node.type === 'pageEmbed') && node.attrs?.id === id) return true;
      return (node.content ?? []).some(hits);
    };
    return Object.values(objects).filter((o) => o.id !== id && !o.archivedAt && hits(o.content?.doc));
  }, [objects, id]);
  if (!refs.length) return null;
  return (
    <section className="backlinks" aria-label="Упоминается в">
      <h2>Упоминается в</h2>
      {refs.map((o) => (
        <button key={o.id} onClick={() => openNote(o.id)}>
          {typeof o.props[ICON_PROP] === 'string' ? <span aria-hidden>{o.props[ICON_PROP] as string}</span> : <FileText size={15} aria-hidden />}
          {o.title.trim() || 'Без названия'}
        </button>
      ))}
    </section>
  );
}
