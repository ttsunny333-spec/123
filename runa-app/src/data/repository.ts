import { SYSTEM_TABLES, TABLES, type Id, type Obj, type SystemRec, type SystemTable, type Table, type TableMap } from '../core/types';
import { supabase } from './supabase';

export interface PushBatch {
  upserts: { [T in Table]: TableMap[T][] };
  deletes: { [T in Table]: Id[] };
}

export type SystemData = { [T in SystemTable]: TableMap[T][] };

export interface Repository {
  loadSystems(): Promise<SystemRec[]>;
  loadSystemData(systemId: Id): Promise<SystemData>;
  loadArchivedObjects(): Promise<Obj[]>;
  push(batch: PushBatch): Promise<void>;
}

type Row = Record<string, unknown>;

interface TableSpec {
  db: string;
  fields: Record<string, string>;
  defaults?: Record<string, unknown>;
}

const SPEC: Record<Table, TableSpec> = {
  systems: {
    db: 'systems',
    fields: { id: 'id', name: 'name', icon: 'icon', cover: 'cover', content: 'content', sortKey: 'sort_key', createdAt: 'created_at', updatedAt: 'updated_at', archivedAt: 'archived_at' },
  },
  objectTypes: {
    db: 'object_types',
    fields: {
      id: 'id', systemId: 'system_id', name: 'name', icon: 'icon', color: 'color',
      sortKey: 'sort_key', createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  relationTypes: {
    db: 'relation_types',
    fields: {
      id: 'id', systemId: 'system_id', name: 'name', inverseName: 'inverse_name', directed: 'directed',
      acyclic: 'acyclic', color: 'color', sortKey: 'sort_key', createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  propertyDefs: {
    db: 'property_defs',
    fields: {
      id: 'id', systemId: 'system_id', name: 'name', kind: 'kind', config: 'config', appliesTo: 'applies_to',
      sortKey: 'sort_key', createdAt: 'created_at', updatedAt: 'updated_at',
    },
    defaults: { config: {} },
  },
  objects: {
    db: 'objects',
    fields: {
      id: 'id', systemId: 'system_id', type: 'type', extraTypes: 'extra_types', title: 'title', parentId: 'parent_id',
      sortKey: 'sort_key', props: 'props', content: 'content', createdAt: 'created_at', updatedAt: 'updated_at',
      archivedAt: 'archived_at',
    },
    defaults: { props: {}, extraTypes: [] },
  },
  views: {
    db: 'views',
    fields: {
      id: 'id', systemId: 'system_id', hostId: 'host_id', kind: 'kind', name: 'name', config: 'config',
      sortKey: 'sort_key', createdAt: 'created_at', updatedAt: 'updated_at',
    },
    defaults: { config: {} },
  },
  viewItems: {
    db: 'view_items',
    fields: { id: 'id', systemId: 'system_id', viewId: 'view_id', objectId: 'object_id', layout: 'layout' },
    defaults: { layout: {} },
  },
  viewElements: {
    db: 'view_elements',
    fields: { id: 'id', systemId: 'system_id', viewId: 'view_id', kind: 'kind', data: 'data' },
    defaults: { data: {} },
  },
  relationships: {
    db: 'relationships',
    fields: { id: 'id', systemId: 'system_id', type: 'type', fromId: 'from_id', toId: 'to_id', props: 'props', createdAt: 'created_at' },
    defaults: { props: {} },
  },
};

function toRow(table: Table, rec: object): Row {
  const out: Row = {};
  const defaults = SPEC[table].defaults ?? {};
  for (const [k, col] of Object.entries(SPEC[table].fields)) out[col] = (rec as Row)[k] ?? defaults[k] ?? null;
  return out;
}

function fromRow<T extends Table>(table: T, row: Row): TableMap[T] {
  const out: Row = {};
  const defaults = SPEC[table].defaults ?? {};
  for (const [k, col] of Object.entries(SPEC[table].fields)) out[k] = row[col] ?? defaults[k] ?? null;
  return out as unknown as TableMap[T];
}

const PAGE = 1000;

async function selectAll(table: Table, filter: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(supabase.from(SPEC[table].db).select('*')).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

export const supabaseRepository: Repository = {
  async loadSystems() {
    const rows = await selectAll('systems', (q) => q.order('sort_key'));
    return rows.map((r) => fromRow('systems', r));
  },

  async loadSystemData(systemId) {
    const results = await Promise.all(
      SYSTEM_TABLES.map((t) => selectAll(t, (q) => q.eq('system_id', systemId).order('id'))),
    );
    const out = {} as Record<SystemTable, unknown[]>;
    SYSTEM_TABLES.forEach((t, i) => (out[t] = results[i].map((r) => fromRow(t, r))));
    return out as SystemData;
  },

  async loadArchivedObjects() {
    const rows = await selectAll('objects', (q) => q.not('archived_at', 'is', null).order('archived_at', { ascending: false }));
    return rows.map((r) => fromRow('objects', r));
  },

  async push(batch) {
    for (const table of TABLES) {
      const rows = batch.upserts[table] as object[];
      if (!rows.length) continue;
      const { error } = await supabase.from(SPEC[table].db).upsert(rows.map((r) => toRow(table, r)));
      if (error) throw error;
    }
    for (const table of [...TABLES].reverse()) {
      const ids = batch.deletes[table];
      if (!ids.length) continue;
      const { error } = await supabase.from(SPEC[table].db).delete().in('id', ids);
      if (error) throw error;
    }
  },
};
