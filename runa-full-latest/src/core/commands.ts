import { keyBetween, newId, nowIso } from './order';
import { defaultStatusProp } from './properties';
import { ancestors, childrenOf, descendants, listSystems } from './queries';
import type { DataState, Id, Obj, Op, SystemRec, Table, TableMap } from './types';

function pickPrev<T extends object>(cur: T, patch: Partial<T>): Partial<T> {
  const prev: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) prev[k] = cur[k];
  return prev;
}

function update<T extends Table>(table: T, cur: TableMap[T], patch: Partial<TableMap[T]>): Op {
  return { kind: 'update', table, id: cur.id, patch, prev: pickPrev(cur, patch) } as Op;
}

export function createSystem(state: DataState, name: string): { ops: Op[]; id: Id } {
  const list = listSystems(state);
  const last = list[list.length - 1];
  const now = nowIso();
  const sys: SystemRec = {
    id: newId(),
    name,
    icon: null,
    sortKey: keyBetween(last?.sortKey ?? null, null),
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  return {
    ops: [
      { kind: 'insert', table: 'systems', row: sys },
      { kind: 'insert', table: 'propertyDefs', row: defaultStatusProp(sys.id) },
    ],
    id: sys.id,
  };
}

export function updateSystem(state: DataState, id: Id, patch: Partial<Pick<SystemRec, 'name' | 'icon' | 'cover' | 'content'>>): Op[] {
  const cur = state.systems[id];
  if (!cur) return [];
  return [update('systems', cur, { ...patch, updatedAt: nowIso() })];
}

export function setSystemArchived(state: DataState, id: Id, archived: boolean): Op[] {
  const cur = state.systems[id];
  if (!cur) return [];
  return [update('systems', cur, { archivedAt: archived ? nowIso() : null, updatedAt: nowIso() })];
}

export function deleteSystemForever(state: DataState, id: Id): Op[] {
  const sys = state.systems[id];
  if (!sys) return [];
  const objs = Object.values(state.objects).filter((o) => o.systemId === id);
  const roots = objs.filter((o) => !o.parentId);
  const ops: Op[] = Object.values(state.relationships)
    .filter((r) => r.systemId === id)
    .map((row) => ({ kind: 'remove', table: 'relationships', row }) as Op);
  for (const r of roots) ops.push(...removeSubtree(state, r));
  for (const row of Object.values(state.propertyDefs)) {
    if (row.systemId === id) ops.push({ kind: 'remove', table: 'propertyDefs', row });
  }
  ops.push({ kind: 'remove', table: 'systems', row: sys });
  return ops;
}

export interface CreateObjectInput {
  systemId: Id;
  parentId: Id | null;
  type: string;
  title?: string;
  afterId?: Id;
}

export function createObject(state: DataState, input: CreateObjectInput): { ops: Op[]; id: Id } {
  const siblings = childrenOf(state.objects, input.systemId, input.parentId, true);
  let sortKey: string;
  const idx = input.afterId ? siblings.findIndex((s) => s.id === input.afterId) : -1;
  if (idx >= 0) {
    sortKey = keyBetween(siblings[idx].sortKey, siblings[idx + 1]?.sortKey ?? null);
  } else {
    sortKey = keyBetween(siblings[siblings.length - 1]?.sortKey ?? null, null);
  }
  const now = nowIso();
  const obj: Obj = {
    id: newId(),
    systemId: input.systemId,
    type: input.type,
    title: input.title ?? '',
    parentId: input.parentId,
    sortKey,
    props: {},
    content: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  return { ops: [{ kind: 'insert', table: 'objects', row: obj }], id: obj.id };
}

export function updateObject(
  state: DataState,
  id: Id,
  patch: Partial<Pick<Obj, 'title' | 'type' | 'props' | 'content'>>,
): Op[] {
  const cur = state.objects[id];
  if (!cur) return [];
  return [update('objects', cur, { ...patch, updatedAt: nowIso() })];
}

export type DropPosition = 'before' | 'after' | 'inside';

export function moveObject(state: DataState, id: Id, target: Id | null, position: DropPosition): Op[] {
  const cur = state.objects[id];
  if (!cur) return [];
  let parentId: Id | null;
  let sortKey: string;
  if (target === null || position === 'inside') {
    parentId = target;
    const siblings = childrenOf(state.objects, cur.systemId, parentId, true).filter((s) => s.id !== id);
    sortKey = keyBetween(siblings[siblings.length - 1]?.sortKey ?? null, null);
  } else {
    const t = state.objects[target];
    if (!t || t.id === id) return [];
    parentId = t.parentId;
    const siblings = childrenOf(state.objects, cur.systemId, parentId, true).filter((s) => s.id !== id);
    const i = siblings.findIndex((s) => s.id === target);
    const lo = position === 'before' ? siblings[i - 1]?.sortKey ?? null : siblings[i].sortKey;
    const hi = position === 'before' ? siblings[i].sortKey : siblings[i + 1]?.sortKey ?? null;
    sortKey = keyBetween(lo, hi);
  }
  if (parentId === cur.parentId && sortKey === cur.sortKey) return [];
  return [update('objects', cur, { parentId, sortKey, updatedAt: nowIso() })];
}

export function archiveObject(state: DataState, id: Id): Op[] {
  const cur = state.objects[id];
  if (!cur || cur.archivedAt) return [];
  return [update('objects', cur, { archivedAt: nowIso(), updatedAt: nowIso() })];
}

export function restoreObject(state: DataState, id: Id): Op[] {
  const cur = state.objects[id];
  if (!cur) return [];
  const chain = [...ancestors(state, id), cur].filter((o) => o.archivedAt);
  return chain.map((o) => update('objects', o, { archivedAt: null, updatedAt: nowIso() }));
}

function removeSubtree(state: DataState, root: Obj): Op[] {
  const nodes = [root, ...descendants(state, root.id)].reverse();
  return nodes.map((row) => ({ kind: 'remove', table: 'objects', row }) as Op);
}

export function deleteObjectForever(state: DataState, id: Id): Op[] {
  const root = state.objects[id];
  if (!root) return [];
  const ids = new Set([id, ...descendants(state, id).map((o) => o.id)]);
  const rels: Op[] = Object.values(state.relationships)
    .filter((r) => ids.has(r.fromId) || ids.has(r.toId))
    .map((row) => ({ kind: 'remove', table: 'relationships', row }) as Op);
  return [...rels, ...removeSubtree(state, root)];
}
