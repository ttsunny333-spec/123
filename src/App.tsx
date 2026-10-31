import { useEffect, useState } from 'react';
import { supabaseConfigured } from './data/supabase';
import { initAuth, useApp } from './state/store';
import './ui/app.css';
import './ui/themes.css';
import { AuthScreen } from './ui/Auth';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Home } from './ui/Home';
import { OpenNav } from './ui/TopOpen';
import { NotePage } from './ui/NotePage';
import { Sidebar, type Page } from './ui/Sidebar';
import { Toast } from './ui/Toast';
import { setOpener } from './ui/nav';
import { useNotesSpace } from './ui/notes';

export default function App() {
  const authReady = useApp((s) => s.authReady);
  const session = useApp((s) => s.session);

  useEffect(() => {
    if (supabaseConfigured) return initAuth();
  }, []);

  if (!supabaseConfigured) return <p className="center">Не заданы настройки базы (VITE_SUPABASE_URL, VITE_SUPABASE_KEY).</p>;
  if (!authReady) return <div className="center mark-big" aria-label="Загрузка">ᚱ</div>;
  if (!session) return <AuthScreen />;
  return <Workspace />;
}

function Workspace() {
  const space = useNotesSpace();
  const [page, setPage] = useState<Page>({ kind: 'home' });
  useEffect(() => {
    setOpener((id) => setPage({ kind: 'note', id }));
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z вне полей ввода — отмена и повтор.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ') return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
      e.preventDefault();
      if (e.shiftKey) useApp.getState().redo();
      else useApp.getState().undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <ErrorBoundary label="Левая панель">
        <Sidebar space={space} page={page} go={setPage} />
      </ErrorBoundary>
      <OpenNav />
      <main className="main">
        <ErrorBoundary key={page.kind === 'note' ? page.id : 'home'} label="Страница">
          {page.kind === 'home' ? <Home /> : <NotePage id={page.id} />}
        </ErrorBoundary>
      </main>
      <Toast />
    </div>
  );
}
