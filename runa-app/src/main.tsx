import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from './ui/theme';

initTheme();

const rootEl = document.getElementById('root')!;

/** Если приложение не смогло даже загрузиться — показать текст ошибки, а не белый экран. */
function showFatal(err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  rootEl.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:760px;margin:60px auto;padding:0 24px;font-family:system-ui,sans-serif;color:#1f2328';
  const h = document.createElement('h2');
  h.textContent = 'Runa не загрузилась';
  const p = document.createElement('p');
  p.textContent = 'Скопируйте текст ниже и пришлите его.';
  const pre = document.createElement('pre');
  pre.style.cssText = 'white-space:pre-wrap;background:#f7f6f3;padding:12px;border-radius:8px;font-size:12px';
  pre.textContent = `${e.name}: ${e.message}\n${e.stack ?? ''}`;
  box.append(h, p, pre);
  rootEl.appendChild(box);
}

import('./App')
  .then(({ default: App }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch(showFatal);
