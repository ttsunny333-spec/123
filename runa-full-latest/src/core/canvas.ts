// Холст: позиции объектов (ViewItem), собственные элементы холста (ViewElement)
// и связи между объектами (Relationship). Позиция — состояние вида, связь — данные.

import { newId, nowIso } from './order';
import { isHidden } from './queries';
import type { DataState, Id, Op, Relationship, ViewElement, ViewItem, ViewRec } from './types';

export interface RelationTypeInfo {
  type: string;
  label: string;
  inverse?: string;
  custom?: boolean;
}

const BUILTIN_RELATIONS: RelationTypeInfo[] = [
  { type: 'reference', label: 'Связь', inverse: 'Связь' },
  { type: 'dependency', label: 'Нужно для', inverse: 'Требует' },
  { type: 'blocks', label: 'Блокирует', inverse: 'Заблокировано' },
  { type: 'belongs_to', label: 'Входит в', inverse: 'Включает' },
  { type: 'produces', label: 'Производит', inverse: 'Производится в' },
  { type: 'consumes', label: 'Потребляет', inverse: 'Потребляется в' },
  { type: 'mention', label: 'Упоминает', inverse: 'Упоминается в' },
];

/** Все типы связей текущей системы: встроенные + пользовательские. Обновляется из интерфейса. */
export const RELATION_TYPES: RelationTypeInfo[] = [...BUILTIN_RELATIONS];

export function setCustomRelationTypes(custom: RelationTypeInfo[]) {
  RELATION_TYPES.length = 0;
  RELATION_TYPES.push(...BUILTIN_RELATIONS, ...custom.map((c) => ({ ...c, custom: true })));
}

export const relationInverse = (type: string) =>
  RELATION_TYPES.find((r) => r.type === type)?.inverse || relationLabel(type);

export const relationLabel = (type: string) => RELATION_TYPES.find((r) => r.type === type)?.label ?? 'Связь';

export function canvasItems(state: DataState, viewId: Id): ViewItem[] {
  return Object.values(state.viewItems).filter(
    (i) => i.viewId === viewId && state.objects[i.objectId] && !isHidden(state, i.objectId),
  );
}

export function canvasElements(state: DataState, viewId: Id): ViewElement[] {
  return Object.values(state.viewElements).filter((e) => e.viewId === viewId);
}

/** Связи, у которых оба конца лежат на холсте. */
export function canvasEdges(state: DataState, objectIds: Set<Id>): Relationship[] {
  return Object.values(state.relationships).filter((r) => objectIds.has(r.fromId) && objectIds.has(r.toId));
}

export function placeOnCanvas(state: DataState, view: ViewRec, objectId: Id, x: number, y: number): Op[] {
  const existing = Object.values(state.viewItems).find((i) => i.viewId === view.id && i.objectId === objectId);
  if (existing) {
    return [
      {
        kind: 'update',
        table: 'viewItems',
        id: existing.id,
        patch: { layout: { ...existing.layout, x, y } },
        prev: { layout: existing.layout },
      },
    ];
  }
  return [
    {
      kind: 'insert',
      table: 'viewItems',
      row: { id: newId(), systemId: view.systemId, viewId: view.id, objectId, layout: { x, y } },
    },
  ];
}

export interface CanvasMove {
  objectId?: Id;
  elementId?: Id;
  x: number;
  y: number;
}

export function moveOnCanvas(state: DataState, view: ViewRec, moves: CanvasMove[]): Op[] {
  const ops: Op[] = [];
  for (const m of moves) {
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    if (m.objectId) ops.push(...placeOnCanvas(state, view, m.objectId, x, y));
    if (m.elementId) ops.push(...updateElement(state, m.elementId, { x, y }));
  }
  return ops;
}

/** Убирает объекты с холста. Сами объекты и их связи остаются. */
export function removeFromCanvas(state: DataState, viewId: Id, objectIds: Id[]): Op[] {
  const set = new Set(objectIds);
  return Object.values(state.viewItems)
    .filter((i) => i.viewId === viewId && set.has(i.objectId))
    .map((row) => ({ kind: 'remove', table: 'viewItems', row }) as Op);
}

export function createRelationship(
  state: DataState,
  input: { systemId: Id; fromId: Id; toId: Id; type?: string },
): Op[] {
  const type = input.type ?? 'reference';
  if (input.fromId === input.toId) return [];
  const dup = Object.values(state.relationships).some(
    (r) => r.fromId === input.fromId && r.toId === input.toId && r.type === type,
  );
  if (dup) return [];
  const row: Relationship = {
    id: newId(),
    systemId: input.systemId,
    type,
    fromId: input.fromId,
    toId: input.toId,
    props: {},
    createdAt: nowIso(),
  };
  return [{ kind: 'insert', table: 'relationships', row }];
}

export function setRelationshipType(state: DataState, id: Id, type: string): Op[] {
  const cur = state.relationships[id];
  if (!cur || cur.type === type) return [];
  return [{ kind: 'update', table: 'relationships', id, patch: { type }, prev: { type: cur.type } }];
}

export function reverseRelationship(state: DataState, id: Id): Op[] {
  const cur = state.relationships[id];
  if (!cur) return [];
  return [
    {
      kind: 'update',
      table: 'relationships',
      id,
      patch: { fromId: cur.toId, toId: cur.fromId },
      prev: { fromId: cur.fromId, toId: cur.toId },
    },
  ];
}

export function deleteRelationships(state: DataState, ids: Id[]): Op[] {
  return ids
    .map((id) => state.relationships[id])
    .filter(Boolean)
    .map((row) => ({ kind: 'remove', table: 'relationships', row }) as Op);
}

export function createElement(
  view: ViewRec,
  kind: ViewElement['kind'],
  x: number,
  y: number,
): { ops: Op[]; id: Id } {
  const data: ViewElement['data'] =
    kind === 'sticky'
      ? { x: Math.round(x), y: Math.round(y), w: 180, h: 140, text: '', color: 'yellow' }
      : { x: Math.round(x), y: Math.round(y), w: 480, h: 320, text: 'Группа', color: 'blue' };
  const row: ViewElement = { id: newId(), systemId: view.systemId, viewId: view.id, kind, data };
  return { ops: [{ kind: 'insert', table: 'viewElements', row }], id: row.id };
}

export function updateElement(state: DataState, id: Id, patch: Partial<ViewElement['data']>): Op[] {
  const cur = state.viewElements[id];
  if (!cur) return [];
  return [
    {
      kind: 'update',
      table: 'viewElements',
      id,
      patch: { data: { ...cur.data, ...patch } },
      prev: { data: cur.data },
    },
  ];
}

export function deleteElements(state: DataState, ids: Id[]): Op[] {
  return ids
    .map((id) => state.viewElements[id])
    .filter(Boolean)
    .map((row) => ({ kind: 'remove', table: 'viewElements', row }) as Op);
}
