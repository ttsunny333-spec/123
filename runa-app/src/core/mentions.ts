import { newId, nowIso } from './order';
import type { DataState, Id, Op, Relationship } from './types';

export interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
}

/** Документ из простого текста: каждая строка — абзац. */
export function docFromPlain(text: string): DocNode {
  const lines = text.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
  };
}

export function extractMentionIds(doc: unknown): Id[] {
  const out = new Set<Id>();
  const walk = (n: DocNode | undefined) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'mention' && typeof n.attrs?.id === 'string') out.add(n.attrs.id);
    n.content?.forEach(walk);
  };
  walk(doc as DocNode);
  return [...out];
}

/** Приводит связи типа «mention» от объекта в соответствие с упоминаниями в его тексте. */
export function syncMentions(state: DataState, objId: Id, mentionIds: Id[]): Op[] {
  const obj = state.objects[objId];
  if (!obj) return [];
  const wanted = new Set(
    mentionIds.filter((id) => id !== objId && state.objects[id]?.systemId === obj.systemId),
  );
  const existing = Object.values(state.relationships).filter((r) => r.type === 'mention' && r.fromId === objId);
  const ops: Op[] = [];
  for (const r of existing) {
    if (wanted.has(r.toId)) wanted.delete(r.toId);
    else ops.push({ kind: 'remove', table: 'relationships', row: r });
  }
  for (const toId of wanted) {
    const row: Relationship = {
      id: newId(),
      systemId: obj.systemId,
      type: 'mention',
      fromId: objId,
      toId,
      props: {},
      createdAt: nowIso(),
    };
    ops.push({ kind: 'insert', table: 'relationships', row });
  }
  return ops;
}

export function linksOf(state: DataState, objId: Id): { outgoing: Relationship[]; incoming: Relationship[] } {
  const outgoing: Relationship[] = [];
  const incoming: Relationship[] = [];
  for (const r of Object.values(state.relationships)) {
    if (r.fromId === objId && state.objects[r.toId]) outgoing.push(r);
    else if (r.toId === objId && state.objects[r.fromId]) incoming.push(r);
  }
  return { outgoing, incoming };
}
