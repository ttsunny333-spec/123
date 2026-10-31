// Открыть заметку из мест без доступа к состоянию приложения (редактор, блоки).
import type { Id } from '../core/types';

let opener: ((id: Id) => void) | null = null;
export const setOpener = (fn: (id: Id) => void) => (opener = fn);
export const openNote = (id: Id) => opener?.(id);
