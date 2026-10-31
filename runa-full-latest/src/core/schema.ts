// Схема системы: пользовательские типы объектов и типы связей.

import { compareKeys, keyBetween, newId, nowIso } from './order';
import type { DataState, Id, Obj, ObjectType, Op, RelationType } from './types';

export const BUILTIN_TYPES = ['area', 'folder', 'page', 'task'] as const;
export const BUILTIN_ACYCLIC = new Set(['dependency', 'blocks']);

/** Все типы объекта: основной первым, затем дополнительные. */
export function objTypes(obj: Obj): string[] {
  const extra = (obj.extraTypes ?? []).filter((t) => t !== obj.type);
  return [obj.type, ...extra];
}

export function objectTypesOf(state: DataState, systemId: Id): ObjectType[] {
  return Object.values(state.objectTypes)
    .filter((t) => t.systemId === systemId)
    .sort((a, b) => compareKeys(a.sortKey, b.sortKey));
}

export function relationTypesOf(state: DataState, systemId: Id): RelationType[] {
  return Object.values(state.relationTypes)
    .filter((t) => t.systemId === systemId)
    .sort((a, b) => compareKeys(a.sortKey, b.sortKey));
}

const TYPE_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink', 'slate'];

export function createObjectType(state: DataState, systemId: Id, name: string): { ops: Op[]; id: Id } {
  const list = objectTypesOf(state, systemId);
  const now = nowIso();
  const row: ObjectType = {
    id: newId(),
    systemId,
    name,
    icon: null,
    color: TYPE_COLORS[list.length % TYPE_COLORS.length],
    sortKey: keyBetween(list[list.length - 1]?.sortKey ?? null, null),
    createdAt: now,
    updatedAt: now,
  };
  return { ops: [{ kind: 'insert', table: 'objectTypes', row }], id: row.id };
}

export function updateObjectType(
  state: DataState,
  id: Id,
  patch: Partial<Pick<ObjectType, 'name' | 'icon' | 'color'>>,
): Op[] {
  const cur = state.objectTypes[id];
  if (!cur) return [];
  const next = { ...patch, updatedAt: nowIso() };
  const prev: Partial<ObjectType> = {};
  for (const k of Object.keys(next) as (keyof ObjectType)[]) (prev as Record<string, unknown>)[k] = cur[k];
  return [{ kind: 'update', table: 'objectTypes', id, patch: next, prev }];
}

/**
 * Удаляет тип. Объекты с этим основным типом становятся страницами,
 * из дополнительных тип убирается. Значения полей в объектах остаются.
 */
export function deleteObjectType(state: DataState, id: Id): Op[] {
  const row = state.objectTypes[id];
  if (!row) return [];
  const ops: Op[] = [];
  for (const o of Object.values(state.objects)) {
    if (o.systemId !== row.systemId) continue;
    const extras = o.extraTypes ?? [];
    if (o.type !== id && !extras.includes(id)) continue;
    const patch: Partial<Obj> = { updatedAt: nowIso() };
    if (o.type === id) patch.type = 'page';
    if (extras.includes(id)) patch.extraTypes = extras.filter((t) => t !== id);
    const prev: Partial<Obj> = { updatedAt: o.updatedAt };
    if ('type' in patch) prev.type = o.type;
    if ('extraTypes' in patch) prev.extraTypes = o.extraTypes;
    ops.push({ kind: 'update', table: 'objects', id: o.id, patch, prev });
  }
  ops.push({ kind: 'remove', table: 'objectTypes', row });
  return ops;
}

/** Меняет основной и дополнительные типы объекта. */
export function setObjectTypes(state: DataState, objId: Id, primary: string, extras: string[]): Op[] {
  const cur = state.objects[objId];
  if (!cur) return [];
  const cleanExtras = [...new Set(extras.filter((t) => t && t !== primary))];
  return [
    {
      kind: 'update',
      table: 'objects',
      id: objId,
      patch: { type: primary, extraTypes: cleanExtras, updatedAt: nowIso() },
      prev: { type: cur.type, extraTypes: cur.extraTypes ?? [], updatedAt: cur.updatedAt },
    },
  ];
}

export function createRelationType(
  state: DataState,
  systemId: Id,
  input: { name: string; inverseName?: string; acyclic?: boolean },
): { ops: Op[]; id: Id } {
  const list = relationTypesOf(state, systemId);
  const now = nowIso();
  const row: RelationType = {
    id: newId(),
    systemId,
    name: input.name,
    inverseName: input.inverseName ?? '',
    directed: true,
    acyclic: input.acyclic ?? false,
    color: null,
    sortKey: keyBetween(list[list.length - 1]?.sortKey ?? null, null),
    createdAt: now,
    updatedAt: now,
  };
  return { ops: [{ kind: 'insert', table: 'relationTypes', row }], id: row.id };
}

export function updateRelationType(
  state: DataState,
  id: Id,
  patch: Partial<Pick<RelationType, 'name' | 'inverseName' | 'acyclic' | 'color' | 'directed'>>,
): Op[] {
  const cur = state.relationTypes[id];
  if (!cur) return [];
  const next = { ...patch, updatedAt: nowIso() };
  const prev: Partial<RelationType> = {};
  for (const k of Object.keys(next) as (keyof RelationType)[]) (prev as Record<string, unknown>)[k] = cur[k];
  return [{ kind: 'update', table: 'relationTypes', id, patch: next, prev }];
}

/** Удаляет тип связи вместе со всеми связями этого типа (отменяется целиком). */
export function deleteRelationType(state: DataState, id: Id): Op[] {
  const row = state.relationTypes[id];
  if (!row) return [];
  const rels: Op[] = Object.values(state.relationships)
    .filter((r) => r.type === id)
    .map((r) => ({ kind: 'remove', table: 'relationships', row: r }) as Op);
  return [...rels, { kind: 'remove', table: 'relationTypes', row }];
}

export function isAcyclicType(state: DataState, type: string): boolean {
  return BUILTIN_ACYCLIC.has(type) || state.relationTypes[type]?.acyclic === true;
}

/** Появится ли цикл, если добавить связь from → to данного типа. */
export function wouldCreateCycle(state: DataState, type: string, fromId: Id, toId: Id): boolean {
  if (fromId === toId) return true;
  const next = new Map<Id, Id[]>();
  for (const r of Object.values(state.relationships)) {
    if (r.type !== type) continue;
    const list = next.get(r.fromId) ?? [];
    list.push(r.toId);
    next.set(r.fromId, list);
  }
  const stack = [toId];
  const seen = new Set<Id>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}
