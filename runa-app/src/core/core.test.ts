import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  archiveObject,
  createObject,
  createSystem,
  deleteObjectForever,
  deleteSystemForever,
  moveObject,
  restoreObject,
  updateObject,
} from './commands';
import { commit, redo, undo, type HistoryState } from './history';
import { compareKeys, keyBetween, newId } from './order';
import { childrenOf, isHidden, search } from './queries';
import { emptyData, type Op } from './types';

const fresh = (): HistoryState => ({ data: emptyData(), undo: [], redo: [] });

function run(h: HistoryState, ops: Op[], mergeKey?: string, now?: number): HistoryState {
  const r = commit(h, 'test', ops, { mergeKey, now });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function seed() {
  let h = fresh();
  const s = createSystem(h.data, 'Изучение Python');
  h = run(h, s.ops);
  const a = createObject(h.data, { systemId: s.id, parentId: null, type: 'area', title: 'Основы' });
  h = run(h, a.ops);
  const b = createObject(h.data, { systemId: s.id, parentId: a.id, type: 'page', title: 'Переменные' });
  h = run(h, b.ops);
  const c = createObject(h.data, { systemId: s.id, parentId: b.id, type: 'task', title: 'Упражнение' });
  h = run(h, c.ops);
  return { h, sys: s.id, a: a.id, b: b.id, c: c.id };
}

test('keyBetween даёт строгий порядок при многократных вставках', () => {
  const keys: string[] = [keyBetween(null, null)];
  for (let i = 0; i < 200; i++) keys.push(keyBetween(keys[keys.length - 1], null));
  for (let i = 0; i < 200; i++) keys.splice(1, 0, keyBetween(keys[0], keys[1]));
  for (let i = 0; i < 50; i++) keys.unshift(keyBetween(null, keys[0]));
  const sorted = [...keys].sort(compareKeys);
  assert.deepEqual(keys, sorted);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((k) => !k.endsWith('0')));
});

test('newId — UUIDv7, монотонный по времени', () => {
  const a = newId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('создание иерархии и порядок соседей', () => {
  let { h, sys, a } = seed();
  const x = createObject(h.data, { systemId: sys, parentId: a, type: 'page', title: 'Типы' });
  h = run(h, x.ops);
  const titles = childrenOf(h.data.objects, sys, a).map((o) => o.title);
  assert.deepEqual(titles, ['Переменные', 'Типы']);
});

test('нельзя вложить объект в собственного потомка', () => {
  const { h, a, c } = seed();
  const r = commit(h, 'move', moveObject(h.data, a, c, 'inside'));
  assert.equal(r.ok, false);
});

test('перемещение before/after и отмена', () => {
  let { h, sys, a, b } = seed();
  const t = createObject(h.data, { systemId: sys, parentId: a, type: 'page', title: 'Типы' });
  h = run(h, t.ops);
  h = run(h, moveObject(h.data, t.id, b, 'before'));
  assert.deepEqual(childrenOf(h.data.objects, sys, a).map((o) => o.title), ['Типы', 'Переменные']);
  const u = undo(h)!;
  assert.deepEqual(childrenOf(u.state.data.objects, sys, a).map((o) => o.title), ['Переменные', 'Типы']);
  const r = redo(u.state)!;
  assert.deepEqual(childrenOf(r.state.data.objects, sys, a).map((o) => o.title), ['Типы', 'Переменные']);
});

test('набор текста склеивается в один шаг отмены', () => {
  let { h, b } = seed();
  const steps = h.undo.length;
  h = run(h, updateObject(h.data, b, { title: 'П' }), 'title', 1000);
  h = run(h, updateObject(h.data, b, { title: 'Пе' }), 'title', 1500);
  h = run(h, updateObject(h.data, b, { title: 'Пер' }), 'title', 2000);
  assert.equal(h.undo.length, steps + 1);
  const u = undo(h)!;
  assert.equal(u.state.data.objects[b].title, 'Переменные');
});

test('архив скрывает поддерево, восстановление возвращает предков', () => {
  let { h, a, c } = seed();
  h = run(h, archiveObject(h.data, a));
  assert.equal(isHidden(h.data, c), true);
  assert.equal(search(h.data, 'Упраж').length, 0);
  h = run(h, restoreObject(h.data, c));
  assert.equal(isHidden(h.data, c), false);
});

test('удаление навсегда и полная отмена', () => {
  let { h, a, b, c } = seed();
  const before = h.data;
  h = run(h, deleteObjectForever(h.data, a));
  assert.equal(h.data.objects[b], undefined);
  assert.equal(h.data.objects[c], undefined);
  const u = undo(h)!;
  assert.deepEqual(u.state.data.objects, before.objects);
});

test('удаление системы удаляет её объекты и отменяется', () => {
  let { h, sys } = seed();
  const before = h.data;
  h = run(h, deleteSystemForever(h.data, sys));
  assert.equal(Object.keys(h.data.objects).length, 0);
  assert.deepEqual(undo(h)!.state.data, before);
});

test('транзакция атомарна: ошибка не меняет состояние', () => {
  const { h, sys } = seed();
  const ok = createObject(h.data, { systemId: sys, parentId: null, type: 'page', title: 'Ок' });
  const bad = createObject(h.data, { systemId: sys, parentId: 'нет-такого', type: 'page' });
  const r = commit(h, 'bad', [...ok.ops, ...bad.ops]);
  assert.equal(r.ok, false);
  assert.equal(Object.keys(h.data.objects).length, 3);
});

// ---------- Свойства ----------
import {
  addSelectOption,
  createPropertyDef,
  deletePropertyDef,
  propsFor,
  setPropValue,
  updatePropertyDef,
} from './properties';

test('новая система получает свойство «Статус» для задач', () => {
  const { h, c, b } = seed();
  const task = h.data.objects[c];
  const page = h.data.objects[b];
  assert.deepEqual(propsFor(h.data, task).map((p) => p.name), ['Статус']);
  assert.equal(propsFor(h.data, page).length, 0);
  assert.equal(propsFor(h.data, task)[0].config.options?.length, 3);
});

test('свойства: создание, значение, вариант select и отмена', () => {
  let { h, sys, b } = seed();
  const p = createPropertyDef(h.data, { systemId: sys, name: 'Сложность', kind: 'select', appliesTo: null });
  h = run(h, p.ops);
  const opt = addSelectOption(h.data, p.id, 'Средняя');
  h = run(h, [...opt.ops, ...setPropValue(h.data, b, p.id, opt.optionId)]);
  assert.equal(h.data.objects[b].props[p.id], opt.optionId);
  assert.equal(h.data.propertyDefs[p.id].config.options?.[0].name, 'Средняя');
  const u = undo(h)!;
  assert.equal(u.state.data.objects[b].props[p.id], undefined);
  assert.equal(u.state.data.propertyDefs[p.id].config.options?.length, 0);
});

test('пустое значение удаляет ключ, удаление свойства сохраняет значения', () => {
  let { h, sys, b } = seed();
  const p = createPropertyDef(h.data, { systemId: sys, name: 'Заметка', kind: 'text', appliesTo: null });
  h = run(h, p.ops);
  h = run(h, setPropValue(h.data, b, p.id, 'текст'));
  h = run(h, deletePropertyDef(h.data, p.id));
  assert.equal(h.data.propertyDefs[p.id], undefined);
  assert.equal(h.data.objects[b].props[p.id], 'текст');
  h = undo(h)!.state;
  assert.ok(h.data.propertyDefs[p.id]);
  h = run(h, setPropValue(h.data, b, p.id, ''));
  assert.ok(!(p.id in h.data.objects[b].props));
});

test('ограничение свойства типом', () => {
  let { h, sys, b, c } = seed();
  const p = createPropertyDef(h.data, { systemId: sys, name: 'Срок', kind: 'date', appliesTo: ['task'] });
  h = run(h, p.ops);
  assert.ok(propsFor(h.data, h.data.objects[c]).some((d) => d.id === p.id));
  assert.ok(!propsFor(h.data, h.data.objects[b]).some((d) => d.id === p.id));
  h = run(h, updatePropertyDef(h.data, p.id, { appliesTo: null }));
  assert.ok(propsFor(h.data, h.data.objects[b]).some((d) => d.id === p.id));
});

// ---------- Представления ----------
import { createView, deleteView, kanbanColumns, moveCard, updateView, viewObjects } from './views';

test('канбан группирует задачи по статусу; перенос меняет объект и порядок только в этом виде', () => {
  let { h, sys, a } = seed();
  const t1 = createObject(h.data, { systemId: sys, parentId: a, type: 'task', title: 'Т1' });
  h = run(h, t1.ops);
  const t2 = createObject(h.data, { systemId: sys, parentId: a, type: 'task', title: 'Т2' });
  h = run(h, t2.ops);
  const v = createView(h.data, { systemId: sys, hostId: a, kind: 'kanban' });
  h = run(h, v.ops);
  h = run(h, updateView(h.data, v.id, { config: { types: ['task'] } }));
  const view = () => h.data.views[v.id];
  let cols = kanbanColumns(h.data, view(), viewObjects(h.data, view()));
  assert.equal(cols[0].key, null); // «Без значения»
  assert.equal(cols[0].items.length, 2);
  const status = h.data.propertyDefs[view().config.groupBy!];
  const inWork = status.config.options![1].id;
  h = run(h, moveCard(h.data, view(), t2.id, inWork, [t2.id]));
  assert.equal(h.data.objects[t2.id].props[status.id], inWork);
  cols = kanbanColumns(h.data, view(), viewObjects(h.data, view()));
  assert.deepEqual(cols.find((c) => c.key === inWork)!.items.map((o) => o.title), ['Т2']);
  // Порядок внутри колонки
  h = run(h, moveCard(h.data, view(), t1.id, inWork, [t1.id, t2.id]));
  cols = kanbanColumns(h.data, view(), viewObjects(h.data, view()));
  assert.deepEqual(cols.find((c) => c.key === inWork)!.items.map((o) => o.title), ['Т1', 'Т2']);
  // Отмена возвращает и статус, и порядок
  h = undo(h)!.state;
  assert.equal(h.data.objects[t1.id].props[status.id], undefined);
  // Удаление вида удаляет его позиции, но не объекты
  h = run(h, deleteView(h.data, v.id));
  assert.equal(Object.keys(h.data.viewItems).length, 0);
  assert.ok(h.data.objects[t2.id]);
});

test('таблица: сортировка по свойству, пустые значения в конце', () => {
  let { h, sys, a } = seed();
  const p = createPropertyDef(h.data, { systemId: sys, name: 'Оценка', kind: 'number', appliesTo: null });
  h = run(h, p.ops);
  const ids: string[] = [];
  for (const [title, val] of [['x', 3], ['y', null], ['z', 1]] as const) {
    const o = createObject(h.data, { systemId: sys, parentId: a, type: 'page', title });
    h = run(h, o.ops);
    if (val !== null) h = run(h, setPropValue(h.data, o.id, p.id, val));
    ids.push(o.id);
  }
  const v = createView(h.data, { systemId: sys, hostId: a, kind: 'table' });
  h = run(h, v.ops);
  h = run(h, updateView(h.data, v.id, { config: { sort: { key: p.id, dir: 'asc' } } }));
  const titles = viewObjects(h.data, h.data.views[v.id]).map((o) => o.title);
  assert.deepEqual(titles.slice(0, 2), ['z', 'x']); // остальные без значения — в конце
  assert.deepEqual(titles.slice(2).sort(), ['y', 'Переменные'].sort());
  h = run(h, updateView(h.data, v.id, { config: { sort: { key: p.id, dir: 'desc' } } }));
  assert.deepEqual(viewObjects(h.data, h.data.views[v.id]).map((o) => o.title).slice(0, 2), ['x', 'z']);
});

// ---------- Холст ----------
import {
  canvasEdges,
  canvasItems,
  createElement,
  createRelationship,
  deleteRelationships,
  moveOnCanvas,
  placeOnCanvas,
  removeFromCanvas,
} from './canvas';

test('холст: позиции принадлежат виду, связи — данным; убрать с холста не удаляет объект', () => {
  let { h, sys, a, b, c } = seed();
  const v = createView(h.data, { systemId: sys, hostId: a, kind: 'canvas' });
  h = run(h, v.ops);
  const view = () => h.data.views[v.id];
  h = run(h, [...placeOnCanvas(h.data, view(), b, 10, 20), ...placeOnCanvas(h.data, view(), c, 300, 20)]);
  assert.equal(canvasItems(h.data, v.id).length, 2);
  h = run(h, createRelationship(h.data, { systemId: sys, fromId: b, toId: c, type: 'dependency' }));
  assert.equal(createRelationship(h.data, { systemId: sys, fromId: b, toId: c, type: 'dependency' }).length, 0); // без дублей
  assert.equal(canvasEdges(h.data, new Set([b, c])).length, 1);
  h = run(h, moveOnCanvas(h.data, view(), [{ objectId: b, x: 55.6, y: 70.2 }]));
  assert.deepEqual(canvasItems(h.data, v.id).find((i) => i.objectId === b)!.layout, { x: 56, y: 70 });
  h = run(h, removeFromCanvas(h.data, v.id, [b]));
  assert.ok(h.data.objects[b]);
  assert.equal(canvasItems(h.data, v.id).length, 1);
  const rel = Object.values(h.data.relationships)[0];
  assert.ok(rel); // связь осталась в данных
  h = run(h, deleteRelationships(h.data, [rel.id]));
  assert.equal(Object.keys(h.data.relationships).length, 0);
  const st = createElement(view(), 'sticky', 5, 5);
  h = run(h, st.ops);
  h = run(h, deleteView(h.data, v.id));
  assert.equal(Object.keys(h.data.viewElements).length, 0);
  assert.equal(Object.keys(h.data.viewItems).length, 0);
});

// ---------- Документы и упоминания ----------
import { docFromPlain, extractMentionIds, linksOf, syncMentions } from './mentions';

test('упоминания в тексте синхронизируются со связями и дают обратные ссылки', () => {
  let { h, a, b, c } = seed();
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'см. ' }, { type: 'mention', attrs: { id: b } }] },
      { type: 'paragraph', content: [{ type: 'mention', attrs: { id: c } }, { type: 'mention', attrs: { id: b } }] },
    ],
  };
  assert.deepEqual(extractMentionIds(doc).sort(), [b, c].sort());
  h = run(h, syncMentions(h.data, a, extractMentionIds(doc)));
  assert.equal(linksOf(h.data, b).incoming.length, 1);
  assert.equal(linksOf(h.data, a).outgoing.length, 2);
  assert.equal(syncMentions(h.data, a, [b, c]).length, 0); // уже синхронно
  h = run(h, syncMentions(h.data, a, [c]));
  assert.equal(linksOf(h.data, b).incoming.length, 0);
  assert.equal(syncMentions(h.data, a, [a]).length, 1); // на себя не ссылаемся: удаляется только c
  assert.equal(docFromPlain('a\n\nb').content?.length, 3);
});

// ---------- Граф ----------
import { buildGraph, neighbors } from './graph';

test('граф: охват, иерархия, локальный граф и изолированные', () => {
  let { h, sys, a, b, c } = seed();
  const lone = createObject(h.data, { systemId: sys, parentId: null, type: 'page', title: 'Одиночка' });
  h = run(h, lone.ops);
  h = run(h, createRelationship(h.data, { systemId: sys, fromId: c, toId: a, type: 'dependency' }));
  const v = createView(h.data, { systemId: sys, hostId: null, kind: 'graph' });
  h = run(h, v.ops);
  const view = () => h.data.views[v.id];
  let g = buildGraph(h.data, view());
  assert.equal(g.nodes.length, 4);
  assert.equal(g.edges.length, 3); // 2 иерархии + 1 связь
  assert.equal(g.isolated, 1);
  h = run(h, updateView(h.data, v.id, { config: { isolated: false, hierarchy: false } }));
  g = buildGraph(h.data, view());
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), [a, c].sort());
  assert.deepEqual([...neighbors(g, c)].sort(), [a, c].sort());
  // Локальный граф вокруг b с глубиной 1 по иерархии
  const lv = createView(h.data, { systemId: sys, hostId: b, kind: 'graph' });
  h = run(h, lv.ops);
  h = run(h, updateView(h.data, lv.id, { config: { scope: 'local', hops: 1 } }));
  g = buildGraph(h.data, h.data.views[lv.id]);
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), [a, b, c].sort());
});

// ---------- Схема: типы объектов и связей ----------
import {
  createObjectType,
  createRelationType,
  deleteObjectType,
  deleteRelationType,
  objTypes,
  setObjectTypes,
  wouldCreateCycle,
} from './schema';

test('основной и дополнительные типы: поля объединяются, удаление типа не теряет данные', () => {
  let { h, sys, b } = seed();
  const lesson = createObjectType(h.data, sys, 'Урок');
  h = run(h, lesson.ops);
  const level = createPropertyDef(h.data, { systemId: sys, name: 'Сложность', kind: 'number', appliesTo: [lesson.id] });
  h = run(h, level.ops);
  h = run(h, setObjectTypes(h.data, b, lesson.id, ['task', lesson.id]));
  assert.deepEqual(objTypes(h.data.objects[b]), [lesson.id, 'task']);
  const names = propsFor(h.data, h.data.objects[b]).map((p) => p.name).sort();
  assert.deepEqual(names, ['Сложность', 'Статус']);
  h = run(h, setPropValue(h.data, b, level.id, 3));
  h = run(h, deleteObjectType(h.data, lesson.id));
  assert.equal(h.data.objects[b].type, 'page');
  assert.deepEqual(h.data.objects[b].extraTypes, ['task']);
  assert.equal(h.data.objects[b].props[level.id], 3);
  h = undo(h)!.state;
  assert.equal(h.data.objects[b].type, lesson.id);
});

test('ацикличный тип связи не даёт замкнуть круг', () => {
  let { h, sys, a, b, c } = seed();
  const req = createRelationType(h.data, sys, { name: 'Нужно для', inverseName: 'Требует', acyclic: true });
  h = run(h, req.ops);
  h = run(h, createRelationship(h.data, { systemId: sys, fromId: a, toId: b, type: req.id }));
  h = run(h, createRelationship(h.data, { systemId: sys, fromId: b, toId: c, type: req.id }));
  assert.equal(wouldCreateCycle(h.data, req.id, c, a), true);
  const r = commit(h, 'cycle', createRelationship(h.data, { systemId: sys, fromId: c, toId: a, type: req.id }));
  assert.equal(r.ok, false);
  // Встроенная «Нужно для» тоже ацикличная
  h = run(h, createRelationship(h.data, { systemId: sys, fromId: a, toId: b, type: 'dependency' }));
  assert.equal(commit(h, 'x', createRelationship(h.data, { systemId: sys, fromId: b, toId: a, type: 'dependency' })).ok, false);
  // Удаление типа связи удаляет его связи и отменяется целиком
  h = run(h, deleteRelationType(h.data, req.id));
  assert.equal(Object.values(h.data.relationships).filter((x) => x.type === req.id).length, 0);
  h = undo(h)!.state;
  assert.equal(Object.values(h.data.relationships).filter((x) => x.type === req.id).length, 2);
});

// ---------- Ссылки и вложения ----------
import { embedFor, formatSize, kindOfFile, normalizeUrl } from '../data/embeds';

test('ссылки приводятся к виду https://…', () => {
  assert.equal(normalizeUrl('example.com/a'), 'https://example.com/a');
  assert.equal(normalizeUrl('  https://example.com  '), 'https://example.com/');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('два слова.com'), null);
  assert.equal(normalizeUrl('localhost'), null);
  assert.equal(normalizeUrl(''), null);
});

test('встраивание: известные сервисы и защита от чужого', () => {
  assert.equal(embedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(embedFor('https://youtu.be/dQw4w9WgXcQ?t=5')?.provider, 'YouTube');
  assert.equal(embedFor('https://youtube.com/shorts/abc123')?.video, true);
  assert.equal(embedFor('https://vimeo.com/123456')?.src, 'https://player.vimeo.com/video/123456');
  assert.equal(embedFor('https://www.loom.com/share/abcdef')?.src, 'https://www.loom.com/embed/abcdef');
  assert.equal(embedFor('https://docs.google.com/document/d/AbC-123/edit')?.src, 'https://docs.google.com/document/d/AbC-123/preview');
  assert.equal(embedFor('https://docs.google.com/presentation/d/XyZ/edit#slide=1')?.src, 'https://docs.google.com/presentation/d/XyZ/embed');
  assert.equal(embedFor('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')?.src, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.match(embedFor('https://www.figma.com/design/abc/Name')!.src, /^https:\/\/www\.figma\.com\/embed\?/);
  assert.equal(embedFor('https://example.com/video.mp4'), null);
  assert.equal(embedFor('http://youtube.com/watch?v=x'), null); // только https
  assert.equal(embedFor('https://evil.com/?v=dQw4w9WgXcQ'), null);
  assert.equal(embedFor('https://notyoutube.com/watch?v=abc'), null);
});

test('тип вложения и размер', () => {
  assert.equal(kindOfFile({ type: 'image/png', name: 'a.png' }), 'image');
  assert.equal(kindOfFile({ type: 'video/mp4', name: 'a.mp4' }), 'video');
  assert.equal(kindOfFile({ type: 'audio/mpeg', name: 'a.mp3' }), 'audio');
  assert.equal(kindOfFile({ type: '', name: 'Doc.PDF' }), 'pdf');
  assert.equal(kindOfFile({ type: 'application/zip', name: 'a.zip' }), 'file');
  assert.equal(formatSize(500), '500 Б');
  assert.equal(formatSize(2048), '2 КБ');
  assert.equal(formatSize(5 * 1024 * 1024), '5.0 МБ');
  assert.equal(formatSize(30 * 1024 * 1024), '30 МБ');
});

// ---------- Markdown и ZIP ----------
import { docToMarkdown, makeZip, crc32, safeFileName } from '../data/markdown';

test('документ превращается в Markdown', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'План' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Жирный', marks: [{ type: 'bold' }] }, { type: 'text', text: ' и ' }, { type: 'mention', attrs: { id: 'x1' } }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'пункт' }] }] }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'готово' }] }] }] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'let a = 1' }] },
    ],
  };
  const md = docToMarkdown(doc, { titleOf: (id) => (id === 'x1' ? 'Цель' : '') });
  assert.equal(md, '## План\n\n**Жирный** и [[Цель]]\n\n- пункт\n\n- [x] готово\n\n```ts\nlet a = 1\n```\n');
});

test('ZIP: контрольная сумма и структура', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = makeZip([{ name: 'a/Заметка.md', data: new TextEncoder().encode('hi') }]);
  assert.equal(zip[0], 0x50); // 'P'
  assert.equal(zip[1], 0x4b); // 'K'
  // End of central directory записан в конце
  const sig = zip.length - 22;
  assert.equal(zip[sig], 0x50);
  assert.equal(zip[sig + 1], 0x4b);
  assert.equal(zip[sig + 2], 0x05);
  assert.equal(zip[sig + 3], 0x06);
});

test('имена файлов очищаются', () => {
  assert.equal(safeFileName('план/2026: «важное»?'), 'план 2026 «важное»');
  assert.equal(safeFileName('   '), 'Без названия');
});
