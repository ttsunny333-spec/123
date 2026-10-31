// Заметки пока хранятся как записи верхнего уровня в одном «пространстве» пользователя.
// Пространство создаётся само при первом входе; пользователю о нём знать не нужно.
import { useEffect, useMemo } from 'react';
import { createObject, createSystem } from '../core/commands';
import { childrenOf, listSystems } from '../core/queries';
import type { Id, Obj } from '../core/types';
import { useApp } from '../state/store';

export function useNotesSpace(): Id | null {
  const data = useApp((s) => s.data);
  const loaded = useApp((s) => s.systemsLoaded);
  const loadSystem = useApp((s) => s.loadSystem);
  const space = listSystems(data)[0]?.id ?? null;

  useEffect(() => {
    if (!loaded) return;
    if (space) {
      loadSystem(space);
    } else {
      const st = useApp.getState();
      st.commit('Создание пространства', createSystem(st.data, 'Мои заметки').ops);
    }
  }, [loaded, space, loadSystem]);

  return space;
}

export function useNotes(space: Id | null): Obj[] {
  const objects = useApp((s) => s.data.objects);
  return useMemo(() => (space ? childrenOf(objects, space, null) : []), [objects, space]);
}

export function createNote(space: Id): Id | null {
  const st = useApp.getState();
  const { ops, id } = createObject(st.data, { systemId: space, parentId: null, type: 'page' });
  return st.commit('Новая заметка', ops) ? id : null;
}
