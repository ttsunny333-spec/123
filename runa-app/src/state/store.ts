import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import * as history from '../core/history';
import { opId } from '../core/ops';
import { emptyData, SYSTEM_TABLES, TABLES, type DataState, type Id, type Op, type Table, type Transaction } from '../core/types';
import { supabaseRepository as repo, type PushBatch } from '../data/repository';
import { supabase } from '../data/supabase';

export type SyncStatus = 'saved' | 'saving' | 'offline';

interface AppState {
  authReady: boolean;
  session: Session | null;
  data: DataState;
  undoStack: Transaction[];
  redoStack: Transaction[];
  systemsLoaded: boolean;
  systemLoad: Record<Id, 'loading' | 'ready' | 'error'>;
  sync: SyncStatus;
  toast: { id: number; text: string } | null;
  expanded: Record<Id, boolean>;
  sidebarOpen: boolean;
  paletteOpen: boolean;
  inspectorOpen: boolean;
  commit: (label: string, ops: Op[], opts?: { mergeKey?: string }) => boolean;
  undo: () => void;
  redo: () => void;
  notify: (text: string) => void;
  loadSystems: () => Promise<void>;
  loadSystem: (id: Id, force?: boolean) => Promise<void>;
  loadArchived: () => Promise<void>;
  setExpanded: (id: Id, open: boolean) => void;
  toggleSidebar: () => void;
  setPalette: (open: boolean) => void;
  toggleInspector: () => void;
  reset: () => void;
}

const EXPANDED_KEY = 'runa.expanded';
const readExpanded = (): Record<Id, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '{}');
  } catch {
    return {};
  }
};

export const useApp = create<AppState>((set, get) => ({
  authReady: false,
  session: null,
  data: emptyData(),
  undoStack: [],
  redoStack: [],
  systemsLoaded: false,
  systemLoad: {},
  sync: 'saved',
  toast: null,
  expanded: readExpanded(),
  sidebarOpen: true,
  paletteOpen: false,
  inspectorOpen: typeof window !== 'undefined' ? window.innerWidth > 1100 : true,

  commit(label, ops, opts) {
    const s = get();
    const r = history.commit({ data: s.data, undo: s.undoStack, redo: s.redoStack }, label, ops, opts);
    if (!r.ok) {
      get().notify(r.error);
      return false;
    }
    set({ data: r.state.data, undoStack: r.state.undo, redoStack: r.state.redo });
    markDirty(r.applied);
    return true;
  },

  undo() {
    const s = get();
    const r = history.undo({ data: s.data, undo: s.undoStack, redo: s.redoStack });
    if (!r) return get().notify('Нечего отменять');
    set({ data: r.state.data, undoStack: r.state.undo, redoStack: r.state.redo });
    markDirty(r.applied);
    get().notify(`Отменено: ${r.label}`);
  },

  redo() {
    const s = get();
    const r = history.redo({ data: s.data, undo: s.undoStack, redo: s.redoStack });
    if (!r) return get().notify('Нечего повторять');
    set({ data: r.state.data, undoStack: r.state.undo, redoStack: r.state.redo });
    markDirty(r.applied);
    get().notify(`Повторено: ${r.label}`);
  },

  notify(text) {
    const id = Date.now();
    set({ toast: { id, text } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 2600);
  },

  async loadSystems() {
    try {
      const systems = await repo.loadSystems();
      set((s) => ({ data: mergeRows(s.data, 'systems', systems), systemsLoaded: true }));
    } catch (e) {
      get().notify(`Не удалось загрузить системы: ${errText(e)}`);
      set({ systemsLoaded: true });
    }
  },

  async loadSystem(id, force = false) {
    const st = get().systemLoad[id];
    if (!force && (st === 'loading' || st === 'ready')) return;
    set((s) => ({ systemLoad: { ...s.systemLoad, [id]: 'loading' } }));
    try {
      const loaded = await repo.loadSystemData(id);
      set((s) => ({
        data: SYSTEM_TABLES.reduce((d, t) => mergeRows(d, t, loaded[t] as never[]), s.data),
        systemLoad: { ...s.systemLoad, [id]: 'ready' },
      }));
    } catch (e) {
      set((s) => ({ systemLoad: { ...s.systemLoad, [id]: 'error' } }));
      get().notify(`Не удалось загрузить систему: ${errText(e)}`);
    }
  },

  async loadArchived() {
    try {
      const objects = await repo.loadArchivedObjects();
      set((s) => ({ data: mergeRows(s.data, 'objects', objects) }));
    } catch (e) {
      get().notify(`Не удалось загрузить архив: ${errText(e)}`);
    }
  },

  setExpanded(id, open) {
    const expanded = { ...get().expanded, [id]: open };
    if (!open) delete expanded[id];
    set({ expanded });
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
    } catch {
      /* хранилище недоступно */
    }
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setPalette: (open) => set({ paletteOpen: open }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),

  reset() {
    dirty.clear();
    set({ data: emptyData(), undoStack: [], redoStack: [], systemsLoaded: false, systemLoad: {}, sync: 'saved' });
  },
}));

function mergeRows<T extends Table>(data: DataState, table: T, rows: DataState[T][Id][]): DataState {
  const next = { ...data[table] } as Record<Id, DataState[T][Id]>;
  for (const row of rows) {
    if (!dirty.has(`${table}:${row.id}`)) next[row.id] = row;
  }
  return { ...data, [table]: next };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e));

const dirty = new Map<string, { table: Table; id: Id }>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
let retryDelay = 1000;

function markDirty(ops: Op[]) {
  for (const op of ops) {
    const id = opId(op);
    dirty.set(`${op.table}:${id}`, { table: op.table, id });
  }
  if (ops.length) {
    useApp.setState({ sync: 'saving' });
    schedule(400);
  }
}

function schedule(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

export async function flush() {
  if (flushing) return schedule(300);
  if (!dirty.size) return;
  flushing = true;
  const batch = [...dirty.entries()];
  dirty.clear();
  const data = useApp.getState().data;
  const push = {
    upserts: Object.fromEntries(TABLES.map((t) => [t, []])),
    deletes: Object.fromEntries(TABLES.map((t) => [t, []])),
  } as unknown as PushBatch;
  for (const [, { table, id }] of batch) {
    const row = (data[table] as Record<Id, never>)[id];
    if (row) (push.upserts[table] as never[]).push(row);
    else push.deletes[table].push(id);
  }
  try {
    await repo.push(push);
    retryDelay = 1000;
    if (!dirty.size) useApp.setState({ sync: 'saved' });
  } catch (e) {
    for (const [k, v] of batch) if (!dirty.has(k)) dirty.set(k, v);
    useApp.setState({ sync: 'offline' });
    console.error('Ошибка сохранения', e);
    retryDelay = Math.min(retryDelay * 2, 30000);
    schedule(retryDelay);
  } finally {
    flushing = false;
    if (dirty.size && useApp.getState().sync !== 'offline') schedule(300);
  }
}

export const hasUnsavedChanges = () => dirty.size > 0 || flushing;

export function initAuth() {
  supabase.auth.getSession().then(({ data }) => {
    useApp.setState({ session: data.session, authReady: true });
    if (data.session) useApp.getState().loadSystems();
  });
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const prev = useApp.getState().session;
    useApp.setState({ session, authReady: true });
    if (event === 'SIGNED_OUT') useApp.getState().reset();
    if (event === 'SIGNED_IN' && prev?.user.id !== session?.user.id) {
      useApp.getState().reset();
      useApp.getState().loadSystems();
    }
  });
  return () => data.subscription.unsubscribe();
}

