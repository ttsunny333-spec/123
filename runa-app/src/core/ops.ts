import { isAcyclicType, wouldCreateCycle } from './schema';
import type { DataState, Id, Op, Table, TableMap } from './types';

type AnyRow = { id: Id };

export function opId(op: Op): Id {
  return op.kind === 'update' ? op.id : op.row.id;
}

export function applyOp(state: DataState, op: Op): DataState {
  const table = state[op.table] as Record<Id, AnyRow>;
  switch (op.kind) {
    case 'insert':
      return { ...state, [op.table]: { ...table, [op.row.id]: op.row } };
    case 'remove': {
      if (!table[op.row.id]) return state;
      const next = { ...table };
      delete next[op.row.id];
      return { ...state, [op.table]: next };
    }
    case 'update': {
      const cur = table[op.id];
      if (!cur) return state;
      return { ...state, [op.table]: { ...table, [op.id]: { ...cur, ...op.patch } } };
    }
  }
}

export function applyOps(state: DataState, ops: Op[]): DataState {
  return ops.reduce(applyOp, state);
}

export function invertOp(op: Op): Op {
  switch (op.kind) {
    case 'insert':
      return { kind: 'remove', table: op.table, row: op.row } as Op;
    case 'remove':
      return { kind: 'insert', table: op.table, row: op.row } as Op;
    case 'update':
      return { kind: 'update', table: op.table, id: op.id, patch: op.prev, prev: op.patch } as Op;
  }
}

/** Обратная транзакция: инвертированные операции в обратном порядке. */
export function invertOps(ops: Op[]): Op[] {
  return ops.map(invertOp).reverse();
}

function get<T extends Table>(state: DataState, table: T, id: Id | null | undefined): TableMap[T] | undefined {
  if (!id) return undefined;
  return (state[table] as Record<Id, TableMap[T]>)[id];
}

/** true, если candidate — это id или один из его потомков. */
export function isSelfOrDescendant(state: DataState, id: Id, candidate: Id): boolean {
  let cur: Id | null = candidate;
  const seen = new Set<Id>();
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) return true; // защита от уже испорченных данных
    seen.add(cur);
    cur = state.objects[cur]?.parentId ?? null;
  }
  return false;
}

/** Возвращает текст ошибки или null, если операция допустима в данном состоянии. */
export function validateOp(state: DataState, op: Op): string | null {
  if (op.table === 'objects') {
    if (op.kind === 'insert') {
      const o = op.row;
      if (state.objects[o.id]) return 'Объект с таким ID уже существует';
      if (!state.systems[o.systemId]) return 'Система не найдена';
      if (o.parentId) {
        const parent = state.objects[o.parentId];
        if (!parent) return 'Родительский объект не найден';
        if (parent.systemId !== o.systemId) return 'Родитель находится в другой системе';
      }
    }
    if (op.kind === 'update') {
      const cur = state.objects[op.id];
      if (!cur) return 'Объект не найден';
      const p = op.patch;
      if ('parentId' in p && p.parentId) {
        const parent = state.objects[p.parentId];
        if (!parent) return 'Родительский объект не найден';
        if (parent.systemId !== cur.systemId) return 'Нельзя переместить объект в другую систему';
        if (isSelfOrDescendant(state, op.id, p.parentId)) return 'Нельзя вложить объект в самого себя или в своего потомка';
      }
    }
  }
  if (op.table === 'relationships' && op.kind === 'insert') {
    const r = op.row;
    if (!get(state, 'objects', r.fromId) || !get(state, 'objects', r.toId)) return 'Связь ссылается на несуществующий объект';
    if (r.fromId === r.toId) return 'Объект не может ссылаться сам на себя';
    if (isAcyclicType(state, r.type) && wouldCreateCycle(state, r.type, r.fromId, r.toId)) {
      return 'Такая связь создаст замкнутый круг зависимостей';
    }
  }
  if (op.kind === 'insert' && (state[op.table] as Record<Id, AnyRow>)[op.row.id]) {
    return 'Запись с таким ID уже существует';
  }
  return null;
}
