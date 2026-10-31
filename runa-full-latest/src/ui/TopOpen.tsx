import { PanelLeft } from 'lucide-react';
import { setSidebarOpen, sidebarOpen } from './Sidebar';
import { useSyncExternalStore } from 'react';

/** Кнопка «открыть навигацию» — видна только когда панель скрыта (в основном на телефоне). */
export function OpenNav() {
  const open = useSyncExternalStore(
    (cb) => {
      sidebarOpen.listeners.add(cb);
      return () => sidebarOpen.listeners.delete(cb);
    },
    () => sidebarOpen.value,
    () => true,
  );
  if (open) return null;
  return (
    <button className="open-nav" onClick={() => setSidebarOpen(true)} aria-label="Открыть навигацию" title="Открыть навигацию">
      <PanelLeft size={18} aria-hidden />
    </button>
  );
}
