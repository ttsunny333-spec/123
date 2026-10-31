import { ImagePlus, MessageSquarePlus, SmilePlus, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { newId, nowIso } from '../core/order';
import { setPropValue } from '../core/properties';
import type { Id, Obj } from '../core/types';
import { useApp } from '../state/store';

export const ICON_PROP = 'builtin.icon';
export const COVER_PROP = 'builtin.cover';
export const COMMENTS_PROP = 'builtin.comments';

export interface NoteComment {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

/** Готовые обложки-градиенты; также можно вставить ссылку на картинку. */
export const COVERS: Record<string, string> = {
  g1: 'linear-gradient(180deg, #8fd3d1 0%, #c9dcdc 100%)',
  g2: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  g3: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
  g4: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
  g5: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
  g6: 'linear-gradient(135deg, #e8d5b7 0%, #b8a07e 100%)',
  g7: 'linear-gradient(135deg, #5d4157 0%, #a8caba 100%)',
  g8: 'linear-gradient(135deg, #3a1c71 0%, #d76d77 55%, #ffaf7b 100%)',
  g9: 'linear-gradient(135deg, #2c3e50 0%, #4b6a85 100%)',
  g10: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
};

const EMOJI = [
  '📝', '📘', '🧭', '🎯', '✅', '🔥', '💡', '📌', '🗂️', '📚', '🧠', '🚀', '🌱', '🎨', '🛠️', '📈',
  '💸', '🏠', '💼', '🎓', '❤️', '⭐', '🌙', '☀️', '🎮', '🐍', '🗺️', '⏳', '🧩', '🔬', '🍀', '✈️',
];

export function coverStyle(cover: unknown): CSSProperties | null {
  if (typeof cover !== 'string' || !cover) return null;
  if (COVERS[cover]) return { background: COVERS[cover] };
  if (/^https?:\/\//i.test(cover)) return { backgroundImage: `url("${cover.replace(/"/g, '')}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return null;
}

const setProp = (id: Id, key: string, value: unknown, label: string) => {
  const st = useApp.getState();
  st.commit(label, setPropValue(st.data, id, key, value));
};

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return ref;
}

function IconPicker({ note, onClose }: { note: Obj; onClose: () => void }) {
  const ref = useOutside(onClose);
  const [own, setOwn] = useState('');
  const pick = (e: string | null) => {
    setProp(note.id, ICON_PROP, e, e ? 'Значок' : 'Значок убран');
    onClose();
  };
  return (
    <div className="picker" ref={ref} role="dialog" aria-label="Выбор значка">
      <div className="picker-grid">
        {EMOJI.map((e) => (
          <button key={e} className="picker-emoji" onClick={() => pick(e)} aria-label={e}>
            {e}
          </button>
        ))}
      </div>
      <form
        className="picker-row"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (own.trim()) pick([...own.trim()].slice(0, 2).join(''));
        }}
      >
        <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Свой эмодзи" aria-label="Свой эмодзи" />
        <button className="btn">ОК</button>
        {typeof note.props[ICON_PROP] === 'string' && (
          <button type="button" className="btn ghost" onClick={() => pick(null)}>
            Убрать
          </button>
        )}
      </form>
    </div>
  );
}

function CoverPicker({ note, onClose }: { note: Obj; onClose: () => void }) {
  const ref = useOutside(onClose);
  const [url, setUrl] = useState('');
  const pick = (c: string | null) => {
    setProp(note.id, COVER_PROP, c, c ? 'Обложка' : 'Обложка убрана');
    onClose();
  };
  return (
    <div className="picker wide" ref={ref} role="dialog" aria-label="Выбор обложки">
      <div className="picker-covers">
        {Object.entries(COVERS).map(([k, v]) => (
          <button key={k} className="picker-cover" style={{ background: v }} onClick={() => pick(k)} aria-label={`Обложка ${k}`} />
        ))}
      </div>
      <form
        className="picker-row"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (/^https?:\/\//i.test(url.trim())) pick(url.trim());
        }}
      >
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ссылка на картинку: https://…" aria-label="Ссылка на картинку" />
        <button className="btn">ОК</button>
        {note.props[COVER_PROP] ? (
          <button type="button" className="btn ghost" onClick={() => pick(null)}>
            Убрать
          </button>
        ) : null}
      </form>
    </div>
  );
}

/** Обложка во всю ширину страницы. */
export function NoteCover({ note }: { note: Obj }) {
  const [open, setOpen] = useState(false);
  const style = coverStyle(note.props[COVER_PROP]);
  if (!style) return null;
  return (
    <div className="note-cover" style={style}>
      <div className="note-cover-actions">
        <button onClick={() => setOpen(true)}>Сменить обложку</button>
        <button onClick={() => setProp(note.id, COVER_PROP, null, 'Обложка убрана')}>Убрать</button>
      </div>
      {open && (
        <div className="note-cover-picker">
          <CoverPicker note={note} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Значок, кнопки «Добавить …» и комментарии над заголовком. */
export function NoteHeader({ note, children }: { note: Obj; children: ReactNode }) {
  const [picker, setPicker] = useState<'icon' | 'cover' | null>(null);
  const [composing, setComposing] = useState(false);
  const icon = typeof note.props[ICON_PROP] === 'string' ? (note.props[ICON_PROP] as string) : null;
  const hasCover = !!coverStyle(note.props[COVER_PROP]);
  const comments = (Array.isArray(note.props[COMMENTS_PROP]) ? note.props[COMMENTS_PROP] : []) as NoteComment[];

  return (
    <div className={hasCover ? 'nh with-cover' : 'nh'}>
      {icon && (
        <button className="nh-icon" onClick={() => setPicker('icon')} aria-label="Сменить значок" title="Сменить значок">
          {icon}
        </button>
      )}
      <div className="nh-add">
        {!icon && (
          <button onClick={() => setPicker('icon')}>
            <SmilePlus size={15} aria-hidden /> Добавить значок
          </button>
        )}
        {!hasCover && (
          <button onClick={() => setPicker('cover')}>
            <ImagePlus size={15} aria-hidden /> Добавить обложку
          </button>
        )}
        {comments.length === 0 && !composing && (
          <button onClick={() => setComposing(true)}>
            <MessageSquarePlus size={15} aria-hidden /> Добавить комментарий
          </button>
        )}
      </div>
      {picker === 'icon' && <IconPicker note={note} onClose={() => setPicker(null)} />}
      {picker === 'cover' && <CoverPicker note={note} onClose={() => setPicker(null)} />}
      {children}
      {(comments.length > 0 || composing) && <Comments note={note} comments={comments} autoFocus={composing} onDone={() => setComposing(false)} />}
    </div>
  );
}

function Comments({ note, comments, autoFocus, onDone }: { note: Obj; comments: NoteComment[]; autoFocus: boolean; onDone: () => void }) {
  const email = useApp((s) => s.session?.user.email ?? 'Вы');
  const [text, setText] = useState('');
  const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const post = () => {
    const t = text.trim();
    if (!t) return;
    const c: NoteComment = { id: newId(), text: t, author: email, createdAt: nowIso() };
    setProp(note.id, COMMENTS_PROP, [...comments, c], 'Комментарий');
    setText('');
    onDone();
  };

  return (
    <section className="comments" aria-label="Комментарии">
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <span className="comment-ava" aria-hidden>
            {(c.author[0] ?? '?').toUpperCase()}
          </span>
          <div className="comment-body">
            <div className="comment-meta">
              <strong>{c.author.split('@')[0]}</strong> <span>{fmt.format(new Date(c.createdAt))}</span>
            </div>
            <p>{c.text}</p>
          </div>
          <button
            className="comment-x"
            aria-label="Удалить комментарий"
            title="Удалить комментарий"
            onClick={() =>
              setProp(
                note.id,
                COMMENTS_PROP,
                comments.filter((x) => x.id !== c.id),
                'Удаление комментария',
              )
            }
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      ))}
      <div className="comment new">
        <span className="comment-ava" aria-hidden>
          {(email[0] ?? '?').toUpperCase()}
        </span>
        <input
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') post();
            if (e.key === 'Escape') {
              setText('');
              onDone();
            }
          }}
          onBlur={() => !text.trim() && onDone()}
          placeholder="Добавить комментарий…"
          aria-label="Новый комментарий"
        />
        <button className="btn small" disabled={!text.trim()} onMouseDown={(e) => e.preventDefault()} onClick={post}>
          Отправить
        </button>
      </div>
    </section>
  );
}
