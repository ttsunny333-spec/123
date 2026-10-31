import { useState, type FormEvent } from 'react';
import { supabase } from '../data/supabase';

/** Вход по почте и паролю или через Google. */
export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === 'up') setMsg('Проверьте почту и подтвердите адрес.');
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark" aria-hidden>
          ᚱ
        </div>
        <h1>{mode === 'in' ? 'Вход в Runa' : 'Регистрация'}</h1>
        <label>
          Почта
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Пароль
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {msg && <p className="auth-msg">{msg}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Подождите…' : mode === 'in' ? 'Войти' : 'Создать аккаунт'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}
        >
          Войти через Google
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </div>
  );
}
