import { THEMES, setTheme, useTheme } from './theme';

/** Переключатель тем внизу левой панели: цветные кружки, выбранный обведён. */
export function ThemeSwitcher() {
  const theme = useTheme();
  const current = THEMES.find((t) => t.id === theme)?.title ?? '';
  return (
    <div className="sb-foot">
      <span className="sb-foot-label">Тема: {current}</span>
      <div className="theme-dots" role="radiogroup" aria-label="Тема оформления">
        {THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={theme === t.id}
            aria-label={t.title}
            title={t.title}
            className={`theme-dot t-${t.id}${theme === t.id ? ' on' : ''}`}
            onClick={() => setTheme(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
