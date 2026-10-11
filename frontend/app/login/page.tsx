'use client';

import { FormEvent, useState } from 'react';
import { DEMO_PASSWORD, DEMO_USERNAME, signIn } from '../auth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn(username, password)) {
      setError('Usuário ou senha inválidos.');
    }
  };

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Stalse Support Desk</p>
        <h1 id="login-title">Entrar</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Usuário
            <input
              autoComplete="username"
              autoFocus
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          {error && <p role="alert" className="login-error">{error}</p>}
          <button type="submit" className="login-submit">Entrar</button>
        </form>
      </section>
      <p className="login-credentials">
        Credenciais de acesso: usuário <strong>{DEMO_USERNAME}</strong> · senha{' '}
        <strong>{DEMO_PASSWORD}</strong>
      </p>
    </main>
  );
}
