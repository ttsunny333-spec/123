// Граф знаний: объекты — вершины, связи и (по желанию) иерархия — рёбра.

import { descendants, isHidden } from './queries';
import type { DataState, Id, Obj, ViewRec } from './types';

export interface GraphNode {
  id: Id;
  obj: Obj;
  degree: number;
}

export interface GraphEdge {
  id: string;
  from: Id;
  to: Id;
  type: string;
  kind: 'rel' | 'tree';
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  isolated: number;
}

export function buildGraph(state: DataState, view: ViewRec): Graph {
  const cfg = view.config;
  const scope = cfg.scope ?? (view.hostId ? 'host' : 'system');
  const visible = (o: Obj) =>
    o.systemId === view.systemId && !isHidden(state, o.id) && (!cfg.types?.length || cfg.types.includes(o.type));

  const all = Object.values(state.objects).filter(visible);
  const allIds = new Set(all.map((o) => o.id));

  // Все возможные рёбра между видимыми объектами.
  const edges: GraphEdge[] = [];
  for (const r of Object.values(state.relationships)) {
    if (r.systemId !== view.systemId || !allIds.has(r.fromId) || !allIds.has(r.toId)) continue;
    if (cfg.relTypes?.length && !cfg.relTypes.includes(r.type)) continue;
    edges.push({ id: r.id, from: r.fromId, to: r.toId, type: r.type, kind: 'rel' });
  }
  if (cfg.hierarchy !== false) {
    for (const o of all) {
      if (o.parentId && allIds.has(o.parentId)) {
        edges.push({ id: `tree:${o.id}`, from: o.parentId, to: o.id, type: 'parent', kind: 'tree' });
      }
    }
  }

  // Какие вершины входят в выбранный охват.
  let ids: Set<Id>;
  if (scope === 'host' && view.hostId) {
    ids = new Set(descendants(state, view.hostId).map((o) => o.id).filter((id) => allIds.has(id)));
    if (allIds.has(view.hostId)) ids.add(view.hostId);
  } else if (scope === 'local' && view.hostId) {
    ids = new Set([view.hostId]);
    const hops = Math.max(1, Math.min(cfg.hops ?? 2, 5));
    let frontier = new Set([view.hostId]);
    for (let i = 0; i < hops; i++) {
      const next = new Set<Id>();
      for (const e of edges) {
        if (frontier.has(e.from) && !ids.has(e.to)) next.add(e.to);
        if (frontier.has(e.to) && !ids.has(e.from)) next.add(e.from);
      }
      next.forEach((id) => ids.add(id));
      frontier = next;
      if (!next.size) break;
    }
  } else {
    ids = allIds;
  }

  const inScope = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const degree = new Map<Id, number>();
  for (const e of inScope) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  let isolated = 0;
  const nodes: GraphNode[] = [];
  for (const id of ids) {
    const d = degree.get(id) ?? 0;
    if (!d) isolated++;
    if (!d && cfg.isolated === false) continue;
    nodes.push({ id, obj: state.objects[id], degree: d });
  }
  nodes.sort((a, b) => a.obj.createdAt.localeCompare(b.obj.createdAt));
  return { nodes, edges: inScope, isolated };
}

/** Соседи вершины (для подсветки). */
export function neighbors(graph: Graph, id: Id): Set<Id> {
  const out = new Set<Id>([id]);
  for (const e of graph.edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}
