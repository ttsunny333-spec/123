// Темы оформления: «как в системе» + две светлые и две тёмные.
import { useSyncExternalStore } from 'react';

export const THEMES = [
  { id: 'auto', title: 'Как в системе' },
  { id: 'light', title: 'Светлая' },
  { id: 'warm', title: 'Бумага' },
  { id: 'dark', title: 'Графит' },
  { id: 'midnight', title: 'Полночь' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'runa.theme.v2';
const EVENT = 'runa-theme';

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.some((t) => t.id === v) ? (v as ThemeId) : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  if (id === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);
}

export function setTheme(id: ThemeId) {
  applyTheme(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* хранилище недоступно: тема сменится до перезагрузки */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Вызывается до первой отрисовки, чтобы страница не мигала чужой темой. */
export function initTheme() {
  applyTheme(getTheme());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    getTheme,
    () => 'auto',
  );
}
