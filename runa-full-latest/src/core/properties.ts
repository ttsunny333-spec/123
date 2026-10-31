// Пользовательские свойства: определения на уровне системы, значения в объектах.

import { compareKeys, keyBetween, newId, nowIso } from './order';
import { objTypes } from './schema';
import type { DataState, Id, Obj, Op, PropertyDef, PropertyKind, SelectOption } from './types';

export const OPTION_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink', 'slate'];

export function systemProps(state: DataState, systemId: Id): PropertyDef[] {
  return Object.values(state.propertyDefs)
    .filter((p) => p.systemId === systemId)
    .sort((a, b) => compareKeys(a.sortKey, b.sortKey));
}

/** Свойства, которые применимы к объекту с учётом его типа. */
export function propsFor(state: DataState, obj: Obj): PropertyDef[] {
  const types = objTypes(obj);
  return systemProps(state, obj.systemId).filter((p) => p.appliesTo === null || p.appliesTo.some((t) => types.includes(t)));
}

export function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function buildPropertyDef(input: {
  systemId: Id;
  name: string;
  kind: PropertyKind;
  appliesTo: string[] | null;
  sortKey: string;
  options?: string[];
  relationType?: string;
  targetTypes?: string[] | null;
}): PropertyDef {
  const now = nowIso();
  const isSelect = input.kind === 'select' || input.kind === 'multi_select';
  const isRelation = input.kind === 'relation';
  return {
    id: newId(),
    systemId: input.systemId,
    name: input.name,
    kind: input.kind,
    config: isSelect
      ? { options: (input.options ?? []).map((name, i) => ({ id: newId(), name, color: OPTION_COLORS[i % OPTION_COLORS.length] })) }
      : isRelation
        ? { relationType: input.relationType ?? 'reference', targetTypes: input.targetTypes ?? null }
        : {},
    appliesTo: input.appliesTo,
    sortKey: input.sortKey,
    createdAt: now,
    updatedAt: now,
  };
}

/** Свойство «Статус» для задач — создаётся в каждой новой системе. */
export function defaultStatusProp(systemId: Id): PropertyDef {
  return buildPropertyDef({
    systemId,
    name: 'Статус',
    kind: 'select',
    appliesTo: ['task'],
    sortKey: keyBetween(null, null),
    options: ['Не начато', 'В работе', 'Готово'],
  });
}

export function createPropertyDef(
  state: DataState,
  input: {
    systemId: Id;
    name: string;
    kind: PropertyKind;
    appliesTo: string[] | null;
    relationType?: string;
    targetTypes?: string[] | null;
  },
): { ops: Op[]; id: Id } {
  const list = systemProps(state, input.systemId);
  const def = buildPropertyDef({ ...input, sortKey: keyBetween(list[list.length - 1]?.sortKey ?? null, null) });
  return { ops: [{ kind: 'insert', table: 'propertyDefs', row: def }], id: def.id };
}

export function updatePropertyDef(
  state: DataState,
  id: Id,
  patch: Partial<Pick<PropertyDef, 'name' | 'config' | 'appliesTo'>>,
): Op[] {
  const cur = state.propertyDefs[id];
  if (!cur) return [];
  const full = { ...patch, updatedAt: nowIso() };
  const prev: Partial<PropertyDef> = {};
  for (const k of Object.keys(full) as (keyof PropertyDef)[]) (prev as Record<string, unknown>)[k] = cur[k];
  return [{ kind: 'update', table: 'propertyDefs', id, patch: full, prev }];
}

/**
 * Удаляет только определение. Значения в объектах остаются нетронутыми,
 * поэтому отмена удаления возвращает свойство вместе со всеми значениями.
 */
export function deletePropertyDef(state: DataState, id: Id): Op[] {
  const row = state.propertyDefs[id];
  return row ? [{ kind: 'remove', table: 'propertyDefs', row }] : [];
}

export function addSelectOption(state: DataState, propId: Id, name: string): { ops: Op[]; optionId: Id } {
  const def = state.propertyDefs[propId];
  if (!def) return { ops: [], optionId: '' };
  const options = def.config.options ?? [];
  const option: SelectOption = { id: newId(), name, color: OPTION_COLORS[options.length % OPTION_COLORS.length] };
  return {
    ops: updatePropertyDef(state, propId, { config: { ...def.config, options: [...options, option] } }),
    optionId: option.id,
  };
}

/** Устанавливает значение свойства объекта; пустое значение удаляет ключ. */
export function setPropValue(state: DataState, objId: Id, propId: Id, value: unknown): Op[] {
  const cur = state.objects[objId];
  if (!cur) return [];
  const props = { ...cur.props };
  if (isEmptyValue(value)) delete props[propId];
  else props[propId] = value;
  const now = nowIso();
  return [
    {
      kind: 'update',
      table: 'objects',
      id: objId,
      patch: { props, updatedAt: now },
      prev: { props: cur.props, updatedAt: cur.updatedAt },
    },
  ];
}

export function optionById(def: PropertyDef, id: unknown): SelectOption | undefined {
  return def.config.options?.find((o) => o.id === id);
}
