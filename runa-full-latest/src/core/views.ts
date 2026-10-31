import { compareKeys, keyBetween, newId, nowIso } from './order';
import { optionById, setPropValue, systemProps } from './properties';
import { childrenOf, descendants, isHidden } from './queries';
import type { DataState, Id, Obj, Op, PropertyDef, SelectOption, ViewConfig, ViewItem, ViewKind, ViewRec } from './types';

export const VIEW_LABEL: Record<ViewKind, string> = { table: 'Таблица', kanban: 'Канбан', canvas: 'Холст', graph: 'Граф' };

export function viewsFor(state: DataState, systemId: Id, hostId: Id | null): ViewRec[] {
  return Object.values(state.views)
    .filter((v) => v.systemId === systemId && v.hostId === hostId)
    .sort((a, b) => compareKeys(a.sortKey, b.sortKey));
}

function firstSelectProp(state: DataState, systemId: Id, type: string): PropertyDef | undefined {
  return systemProps(state, systemId).find(
    (p) => p.kind === 'select' && (p.appliesTo === null || p.appliesTo.includes(type)),
  );
}

export function createView(
  state: DataState,
  input: { systemId: Id; hostId: Id | null; kind: ViewKind },
): { ops: Op[]; id: Id } {
  const list = viewsFor(state, input.systemId, input.hostId);
  const now = nowIso();
  const newType = input.kind === 'kanban' ? 'task' : 'page';
  const config: ViewConfig = { depth: 'children', types: null, sort: null, newType };
  if (input.kind === 'kanban') config.groupBy = firstSelectProp(state, input.systemId, 'task')?.id ?? null;
  if (input.kind === 'graph') Object.assign(config, { scope: input.hostId ? 'host' : 'system', hops: 2, hierarchy: true, isolated: true });
  const view: ViewRec = {
    id: newId(),
    systemId: input.systemId,
    hostId: input.hostId,
    kind: input.kind,
    name: VIEW_LABEL[input.kind],
    config,
    sortKey: keyBetween(list[list.length - 1]?.sortKey ?? null, null),
    createdAt: now,
    updatedAt: now,
  };
  return { ops: [{ kind: 'insert', table: 'views', row: view }], id: view.id };
}

export function updateView(state: DataState, id: Id, patch: { name?: string; config?: Partial<ViewConfig> }): Op[] {
  const cur = state.views[id];
  if (!cur) return [];
  const next: Partial<ViewRec> = { updatedAt: nowIso() };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.config) next.config = { ...cur.config, ...patch.config };
  const prev: Partial<ViewRec> = {};
  for (const k of Object.keys(next) as (keyof ViewRec)[]) (prev as Record<string, unknown>)[k] = cur[k];
  return [{ kind: 'update', table: 'views', id, patch: next, prev }];
}

export function deleteView(state: DataState, id: Id): Op[] {
  const view = state.views[id];
  if (!view) return [];
  const items: Op[] = Object.values(state.viewItems)
    .filter((i) => i.viewId === id)
    .map((row) => ({ kind: 'remove', table: 'viewItems', row }) as Op);
  const elements: Op[] = Object.values(state.viewElements)
    .filter((e) => e.viewId === id)
    .map((row) => ({ kind: 'remove', table: 'viewElements', row }) as Op);
  return [...items, ...elements, { kind: 'remove', table: 'views', row: view }];
}

function sortValue(def: PropertyDef | undefined, obj: Obj, key: string): string | number | null {
  if (key === 'title') return obj.title.trim().toLowerCase() || null;
  if (key === 'type') return obj.type;
  if (key === 'updatedAt') return obj.updatedAt;
  if (!def) return null;
  const v = obj.props[def.id];
  if (v === undefined || v === null || v === '') return null;
  if (def.kind === 'number') return typeof v === 'number' ? v : null;
  if (def.kind === 'checkbox') return v === true ? 1 : 0;
  if (def.kind === 'select') {
    const i = (def.config.options ?? []).findIndex((o) => o.id === v);
    return i < 0 ? null : i;
  }
  if (def.kind === 'multi_select') return Array.isArray(v) ? v.length : null;
  return String(v).toLowerCase();
}

export function viewObjects(state: DataState, view: ViewRec): Obj[] {
  const { depth = 'children', types } = view.config;
  let list: Obj[];
  if (depth === 'descendants') {
    list = view.hostId
      ? descendants(state, view.hostId)
      : Object.values(state.objects).filter((o) => o.systemId === view.systemId);
  } else {
    list = childrenOf(state.objects, view.systemId, view.hostId);
  }
  list = list.filter((o) => !isHidden(state, o.id));
  if (types && types.length) list = list.filter((o) => types.includes(o.type));

  const sort = view.config.sort;
  if (sort) {
    const def = state.propertyDefs[sort.key];
    const dir = sort.dir === 'desc' ? -1 : 1;
    list = [...list].sort((a, b) => {
      const va = sortValue(def, a, sort.key);
      const vb = sortValue(def, b, sort.key);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'ru') * dir;
    });
  }
  return list;
}

export function viewColumns(state: DataState, view: ViewRec, objs: Obj[]): PropertyDef[] {
  const types = new Set(objs.map((o) => o.type));
  if (view.config.newType) types.add(view.config.newType);
  return systemProps(state, view.systemId).filter((p) => p.appliesTo === null || p.appliesTo.some((t) => types.has(t)));
}

export function itemsOf(state: DataState, viewId: Id): Map<Id, ViewItem> {
  const m = new Map<Id, ViewItem>();
  for (const i of Object.values(state.viewItems)) if (i.viewId === viewId) m.set(i.objectId, i);
  return m;
}

export interface KanbanColumn {
  key: string | null;
  option?: SelectOption;
  items: Obj[];
}

export function kanbanColumns(state: DataState, view: ViewRec, objs: Obj[]): KanbanColumn[] {
  const def = view.config.groupBy ? state.propertyDefs[view.config.groupBy] : undefined;
  const items = itemsOf(state, view.id);
  const orderOf = (o: Obj) => items.get(o.id)?.layout.order ?? null;
  const byOrder = (a: Obj, b: Obj) => {
    const x = orderOf(a);
    const y = orderOf(b);
    if (x !== null && y !== null) return compareKeys(x, y);
    if (x !== null) return -1;
    if (y !== null) return 1;
    return compareKeys(a.createdAt, b.createdAt);
  };
  if (!def) return [{ key: null, items: [...objs].sort(byOrder) }];
  const cols: KanbanColumn[] = [
    { key: null, items: [] },
    ...(def.config.options ?? []).map((o) => ({ key: o.id, option: o, items: [] as Obj[] })),
  ];
  for (const o of objs) {
    const v = o.props[def.id];
    const col = (optionById(def, v) && cols.find((c) => c.key === v)) || cols[0];
    col.items.push(o);
  }
  for (const c of cols) c.items.sort(byOrder);
  return cols[0].items.length ? cols : cols.slice(1);
}

export function moveCard(state: DataState, view: ViewRec, objId: Id, toKey: string | null, orderedIds: Id[]): Op[] {
  const ops: Op[] = [];
  const def = view.config.groupBy ? state.propertyDefs[view.config.groupBy] : undefined;
  const obj = state.objects[objId];
  if (!obj) return [];
  if (def && (obj.props[def.id] ?? null) !== toKey) ops.push(...setPropValue(state, objId, def.id, toKey));

  const items = itemsOf(state, view.id);
  let prev: string | null = null;
  for (const id of orderedIds) {
    const key = keyBetween(prev, null);
    prev = key;
    const cur = items.get(id);
    if (cur) {
      if (cur.layout.order !== key) {
        ops.push({
          kind: 'update',
          table: 'viewItems',
          id: cur.id,
          patch: { layout: { ...cur.layout, order: key } },
          prev: { layout: cur.layout },
        });
      }
    } else {
      ops.push({
        kind: 'insert',
        table: 'viewItems',
        row: { id: newId(), systemId: view.systemId, viewId: view.id, objectId: id, layout: { order: key } },
      });
    }
  }
  return ops;
}
