import { useEffect } from 'react';
import { useApp } from '../state/store';

/** Сообщение внизу экрана; для удаления — с кнопкой «Отменить». */
export function Toast() {
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useApp.setState({ toast: null }), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  const canUndo = toast.text.startsWith('Удалено');
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {canUndo && (
        <button
          onClick={() => {
            useApp.getState().undo();
          }}
        >
          Отменить
        </button>
      )}
    </div>
  );
}
