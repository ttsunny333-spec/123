import { compareKeys } from './order';
import type { DataState, Id, Obj, SystemRec } from './types';

export function listSystems(state: DataState, archived = false): SystemRec[] {
  return Object.values(state.systems)
    .filter((s) => (archived ? s.archivedAt !== null : s.archivedAt === null))
    .sort((a, b) => compareKeys(a.sortKey, b.sortKey));
}

export function childrenOf(
  objects: DataState['objects'],
  systemId: Id,
  parentId: Id | null,
  includeArchived = false,
): Obj[] {
  return Object.values(objects)
    .filter((o) => o.systemId === systemId && o.parentId === parentId && (includeArchived || o.archivedAt === null))
    .sort((a, b) => compareKeys(a.sortKey, b.sortKey));
}

export function ancestors(state: DataState, id: Id): Obj[] {
  const out: Obj[] = [];
  let cur = state.objects[id]?.parentId ?? null;
  while (cur && state.objects[cur] && out.length < 1000) {
    out.unshift(state.objects[cur]);
    cur = state.objects[cur].parentId;
  }
  return out;
}

/** Все потомки (в порядке обхода в глубину, родитель раньше потомков). */
export function descendants(state: DataState, id: Id): Obj[] {
  const byParent = new Map<Id, Obj[]>();
  for (const o of Object.values(state.objects)) {
    if (!o.parentId) continue;
    const list = byParent.get(o.parentId) ?? [];
    list.push(o);
    byParent.set(o.parentId, list);
  }
  const out: Obj[] = [];
  const walk = (pid: Id) => {
    for (const c of byParent.get(pid) ?? []) {
      out.push(c);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** Объект скрыт, если он или любой предок в архиве. */
export function isHidden(state: DataState, id: Id): boolean {
  let cur: Obj | undefined = state.objects[id];
  while (cur) {
    if (cur.archivedAt) return true;
    cur = cur.parentId ? state.objects[cur.parentId] : undefined;
  }
  return false;
}

export interface SearchHit {
  kind: 'system' | 'object';
  id: Id;
  systemId: Id;
  title: string;
  score: number;
}

export function search(state: DataState, query: string, limit = 30): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (text: string) => {
    const t = text.toLowerCase();
    if (t === q) return 3;
    if (t.startsWith(q)) return 2;
    if (t.includes(q)) return 1;
    return 0;
  };
  const hits: SearchHit[] = [];
  for (const s of Object.values(state.systems)) {
    if (s.archivedAt) continue;
    const sc = score(s.name);
    if (sc) hits.push({ kind: 'system', id: s.id, systemId: s.id, title: s.name, score: sc + 0.5 });
  }
  for (const o of Object.values(state.objects)) {
    if (isHidden(state, o.id) || state.systems[o.systemId]?.archivedAt) continue;
    const text = o.content?.text ?? '';
    const sc = Math.max(score(o.title), score(text) ? 0.5 : 0);
    if (sc) hits.push({ kind: 'object', id: o.id, systemId: o.systemId, title: o.title, score: sc });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru')).slice(0, limit);
}
