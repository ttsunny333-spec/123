import { newId } from './order';
import { applyOp, invertOps, validateOp } from './ops';
import type { DataState, Op, Transaction } from './types';

export interface HistoryState {
  data: DataState;
  undo: Transaction[];
  redo: Transaction[];
}

export type CommitResult =
  | { ok: true; state: HistoryState; applied: Op[] }
  | { ok: false; error: string };

const MERGE_WINDOW_MS = 1500;
const MAX_UNDO = 200;

/**
 * Применяет транзакцию атомарно: если хоть одна операция недопустима, ничего не меняется.
 * Транзакции с одинаковым mergeKey в пределах окна склеиваются в один шаг отмены
 * (например, набор текста в заголовке).
 */
export function commit(
  h: HistoryState,
  label: string,
  ops: Op[],
  opts: { mergeKey?: string; now?: number } = {},
): CommitResult {
  if (ops.length === 0) return { ok: true, state: h, applied: [] };
  let data = h.data;
  for (const op of ops) {
    const err = validateOp(data, op);
    if (err) return { ok: false, error: err };
    data = applyOp(data, op);
  }
  const now = opts.now ?? Date.now();
  const last = h.undo[h.undo.length - 1];
  let undo: Transaction[];
  if (opts.mergeKey && last?.mergeKey === opts.mergeKey && now - last.at < MERGE_WINDOW_MS) {
    undo = [...h.undo.slice(0, -1), { ...last, ops: mergeOps(last.ops, ops), at: now }];
  } else {
    undo = [...h.undo, { id: newId(), label, ops, at: now, mergeKey: opts.mergeKey }].slice(-MAX_UNDO);
  }
  return { ok: true, state: { data, undo, redo: [] }, applied: ops };
}

function mergeOps(prev: Op[], next: Op[]): Op[] {
  // Склеиваем только одиночные update одной записи; иначе просто дописываем.
  if (prev.length === 1 && next.length === 1) {
    const a = prev[0];
    const b = next[0];
    if (a.kind === 'update' && b.kind === 'update' && a.table === b.table && a.id === b.id) {
      return [{ ...a, patch: { ...a.patch, ...b.patch }, prev: { ...b.prev, ...a.prev } } as Op];
    }
  }
  return [...prev, ...next];
}

export function undo(h: HistoryState): { state: HistoryState; applied: Op[]; label: string } | null {
  const tx = h.undo[h.undo.length - 1];
  if (!tx) return null;
  const ops = invertOps(tx.ops);
  const data = ops.reduce(applyOp, h.data);
  return { state: { data, undo: h.undo.slice(0, -1), redo: [...h.redo, tx] }, applied: ops, label: tx.label };
}

export function redo(h: HistoryState): { state: HistoryState; applied: Op[]; label: string } | null {
  const tx = h.redo[h.redo.length - 1];
  if (!tx) return null;
  const data = tx.ops.reduce(applyOp, h.data);
  return {
    state: { data, undo: [...h.undo, { ...tx, mergeKey: undefined }], redo: h.redo.slice(0, -1) },
    applied: tx.ops,
    label: tx.label,
  };
}
