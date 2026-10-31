import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useRef } from 'react';
import { createObject, updateObject } from '../core/commands';
import { ancestors } from '../core/queries';
import type { Obj } from '../core/types';
import { docToMarkdown, makeZip, markdownToText, safeFileName } from '../data/markdown';
import { useApp } from '../state/store';

const enc = new TextEncoder();

function download(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Все заметки системы: вложенные — папками, ссылки [[…]] сохраняются по названиям. */
export function exportAll(space: string) {
  const st = useApp.getState().data;
  const titleOf = (id: string) => {
    const o = st.objects[id];
    return o ? o.title.trim() || 'Без названия' : '';
  };
  const ctx = { titleOf };
  const notes = (Object.values(st.objects) as Obj[]).filter((o) => o.systemId === space && !o.archivedAt);
  const used = new Map<string, number>();
  const files = notes.map((o) => {
    const folders = ancestors(st, o.id).map((a) => safeFileName(a.title));
    const base = safeFileName(o.title);
    const key = [...folders, base].join('/');
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    const name = `${key}${n ? ` ${n + 1}` : ''}.md`;
    const body = docToMarkdown(o.content?.doc ?? (o.content?.text ? { type: 'doc', content: o.content.text.split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) } : null), ctx);
    return { name, data: enc.encode(body) };
  });
  if (!files.length) {
    useApp.getState().notify('Пока нечего экспортировать');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  download(`runa-${stamp}.zip`, makeZip(files), 'application/zip');
  useApp.getState().notify(`Экспортировано заметок: ${files.length}`);
}

/** Импорт .md: каждый файл становится заметкой верхнего уровня, название — из имени файла. */
export function ExchangeButtons({ space }: { space: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const importFiles = async (list: FileList | null) => {
    if (!list || !space) return;
    let n = 0;
    for (const f of Array.from(list)) {
      if (!/\.md$/i.test(f.name) && !f.type.startsWith('text/')) continue;
      const text = markdownToText(await f.text());
      const title = f.name.replace(/\.md$/i, '');
      const st = useApp.getState();
      const created = createObject(st.data, { systemId: space, parentId: null, type: 'page', title });
      if (!st.commit('Импорт заметки', created.ops)) continue;
      const after = useApp.getState();
      after.commit('Текст импортированной заметки', updateObject(after.data, created.id, { content: { format: 'plain', text } }));
      n++;
    }
    useApp.getState().notify(n ? `Импортировано заметок: ${n}` : 'Не нашёл .md-файлов для импорта');
  };
  return (
    <div className="ex-row">
      <button className="sb-item" onClick={() => space && exportAll(space)} disabled={!space} title="Скачать все заметки архивом .zip (Markdown)">
        <ArrowDownToLine size={15} aria-hidden /> Экспорт .zip
      </button>
      <button className="sb-item" onClick={() => input.current?.click()} disabled={!space} title="Импорт заметок из .md-файлов">
        <ArrowUpFromLine size={15} aria-hidden /> Импорт .md
      </button>
      <input
        ref={input}
        type="file"
        accept=".md,text/markdown,text/plain"
        multiple
        hidden
        onChange={(e) => {
          importFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
