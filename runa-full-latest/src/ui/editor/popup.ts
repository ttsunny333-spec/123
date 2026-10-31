// Всплывающий список для «/» и «@». Рисуется без React, текст — через textContent.

export interface PopupItem {
  label: string;
  hint?: string;
  glyph?: string;
  group?: string;
  badge?: string;
  muted?: boolean;
}

interface Props<T> {
  items: T[];
  command: (item: T) => void;
  clientRect?: (() => DOMRect | null) | null;
}

export function popupRenderer<T extends PopupItem>(emptyText = 'Ничего не найдено') {
  let el: HTMLDivElement | null = null;
  let items: T[] = [];
  let index = 0;
  let command: (item: T) => void = () => {};

  const draw = () => {
    if (!el) return;
    el.replaceChildren();
    if (!items.length) {
      const d = document.createElement('div');
      d.className = 'pp-empty';
      d.textContent = emptyText;
      el.appendChild(d);
      return;
    }
    let group: string | undefined;
    items.forEach((it, i) => {
      if (it.group && it.group !== group) {
        const g = document.createElement('div');
        g.className = 'pp-group';
        g.textContent = it.group;
        el!.appendChild(g);
      }
      group = it.group;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = ['pp-item', i === index && 'on', it.muted && 'muted'].filter(Boolean).join(' ');
      if (it.glyph !== undefined) {
        const g = document.createElement('span');
        g.className = 'pp-glyph';
        g.textContent = it.glyph;
        b.appendChild(g);
      }
      const l = document.createElement('span');
      l.className = 'pp-label';
      l.textContent = it.label;
      b.appendChild(l);
      if (it.badge) {
        const s = document.createElement('span');
        s.className = 'pp-badge';
        s.textContent = it.badge;
        b.appendChild(s);
      }
      if (it.hint) {
        const h = document.createElement('span');
        h.className = 'pp-hint';
        h.textContent = it.hint;
        b.appendChild(h);
      }
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        command(it);
      });
      b.addEventListener('mousemove', () => {
        if (index !== i) {
          index = i;
          el?.querySelectorAll('.pp-item').forEach((x, k) => x.classList.toggle('on', k === i));
        }
      });
      el!.appendChild(b);
    });
    el.querySelectorAll<HTMLElement>('.pp-item')[index]?.scrollIntoView({ block: 'nearest' });
  };

  const place = (rect?: DOMRect | null) => {
    if (!el || !rect) return;
    const w = 320;
    const h = Math.min(380, window.innerHeight - 24);
    el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))}px`;
    const below = rect.bottom + 6;
    el.style.top = below + h > window.innerHeight ? `${Math.max(8, rect.top - h - 6)}px` : `${below}px`;
  };

  const set = (p: Props<T>) => {
    items = p.items;
    command = p.command;
    index = 0;
    draw();
    place(p.clientRect?.());
  };

  return {
    onStart: (p: Props<T>) => {
      el = document.createElement('div');
      el.className = 'pp';
      el.setAttribute('role', 'listbox');
      document.body.appendChild(el);
      set(p);
    },
    onUpdate: (p: Props<T>) => set(p),
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'Escape') {
        el?.remove();
        el = null;
        return true;
      }
      if (!items.length) return false;
      if (event.key === 'ArrowDown') {
        index = (index + 1) % items.length;
        draw();
        return true;
      }
      if (event.key === 'ArrowUp') {
        index = (index - 1 + items.length) % items.length;
        draw();
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        command(items[index]);
        return true;
      }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
    },
  };
}
