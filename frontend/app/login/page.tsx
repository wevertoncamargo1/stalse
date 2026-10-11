'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { DEMO_USERNAME, getDemoPassword, setDemoPassword, signIn } from '../auth';

const PROMO_WORDS = ['clareza', 'segurança', 'confiabilidade'] as const;

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [screen, setScreen] = useState<'login' | 'reset'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPasswords, setShowNewPasswords] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [demoPassword, setDemoPasswordLabel] = useState('admin');
  const [promoWord, setPromoWord] = useState<string>(PROMO_WORDS[0]);

  useEffect(() => {
    setDemoPasswordLabel(getDemoPassword());
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceMotion.matches) return;

    let wordIndex = 0;
    let characterIndex = PROMO_WORDS[wordIndex].length;
    let deleting = false;
    let timeout: number;

    const animateWord = () => {
      const word = PROMO_WORDS[wordIndex];
      if (!deleting && characterIndex < word.length) {
        characterIndex += 1;
        setPromoWord(word.slice(0, characterIndex));
        timeout = window.setTimeout(animateWord, 85);
        return;
      }

      if (!deleting) {
        timeout = window.setTimeout(() => {
          deleting = true;
          animateWord();
        }, 1500);
        return;
      }

      if (characterIndex > 0) {
        characterIndex -= 1;
        setPromoWord(word.slice(0, characterIndex));
        timeout = window.setTimeout(animateWord, 42);
        return;
      }

      wordIndex = (wordIndex + 1) % PROMO_WORDS.length;
      deleting = false;
      timeout = window.setTimeout(animateWord, 180);
    };

    timeout = window.setTimeout(() => {
      deleting = true;
      animateWord();
    }, 1700);

    return () => window.clearTimeout(timeout);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn(username, password)) {
      setStatusMessage(null);
      setError('Usuário ou senha inválidos.');
    }
  };

  const handlePasswordReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    if (newPassword.length < 4) {
      setError('A nova senha precisa ter pelo menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!setDemoPassword(newPassword)) {
      setError('Não foi possível salvar a nova senha neste navegador.');
      return;
    }
    setDemoPasswordLabel(newPassword);
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setScreen('login');
    setStatusMessage('Senha de demonstração atualizada neste navegador. Entre com a nova senha.');
  };

  const showLogin = () => {
    setScreen('login');
    setError(null);
    setStatusMessage(null);
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <main className="login-shell">
      <div className="login-layout">
        <section className="login-promo" aria-labelledby="login-promo-title">
          <Link className="login-brand" href="/" aria-label="Stalse início">
            <span className="login-brand-mark" aria-hidden="true">s</span>
            <span>stalse<small>SUPPORT DESK</small></span>
          </Link>
          <div className="login-promo-copy">
            <p className="login-promo-eyebrow">ATENDIMENTO COM MAIS CONTEXTO</p>
            <h1
              id="login-promo-title"
              aria-label="Cada pedido conta. Cuide de cada um com clareza, segurança e confiabilidade."
            >
              Cada pedido conta.
              <br />
              Cuide de cada um com{' '}
              <span className="login-rotating-word" aria-hidden="true">
                {promoWord}.
              </span>
            </h1>
            <p className="login-promo-description">
              Organize pedidos, acompanhe prioridades e entenda a experiência do cliente em
              um só lugar. Menos tempo procurando. Mais tempo resolvendo.
            </p>
          </div>
          <div className="login-promo-board" aria-label="Prévia ilustrativa da organização de pedidos">
            <div className="login-board-top">
              <span>Seu atendimento, em perspectiva</span>
              <span className="login-board-live"><i /> AO VIVO</span>
            </div>
            <div className="login-board-columns">
              <div className="login-board-column">
                <span className="login-board-column-title"><i className="login-board-dot dot-new" />Abertos <b>3</b></span>
                <div className="login-board-ticket">
                  <small>#10482</small><strong>Pedido aguardando retorno</strong><span><i className="priority-marker marker-high" /> Prioridade alta</span>
                </div>
                <div className="login-board-ticket">
                  <small>#10479</small><strong>Dúvida sobre a entrega</strong><span><i className="priority-marker marker-medium" /> Prioridade média</span>
                </div>
              </div>
              <div className="login-board-column">
                <span className="login-board-column-title"><i className="login-board-dot dot-progress" />Em andamento <b>2</b></span>
                <div className="login-board-ticket">
                  <small>#10465</small><strong>Acompanhar avaliação</strong><span><i className="priority-marker marker-low" /> Prioridade baixa</span>
                </div>
                <div className="login-board-next">Um quadro claro. Próximos passos melhores.</div>
              </div>
            </div>
          </div>
          <div className="login-promo-points">
            <span><i aria-hidden="true">✓</i> Visão organizada</span>
            <span><i aria-hidden="true">✓</i> Prioridades claras</span>
            <span><i aria-hidden="true">✓</i> Decisões com contexto</span>
          </div>
          <span className="login-promo-glow" aria-hidden="true" />
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-card">
            <span className="login-card-icon" aria-hidden="true">↗</span>
            <p className="eyebrow">BEM-VINDO À STALSE</p>
            {screen === 'login' ? (
              <>
                <h2 id="login-title">Acesse seu painel</h2>
                <p className="login-intro">Entre para acompanhar seus pedidos e atendimentos.</p>
                <form onSubmit={handleSubmit} className="login-form">
                  <label>
                    Usuário
                    <input
                      autoComplete="username"
                      autoFocus
                      onChange={(event) => {
                        setUsername(event.target.value);
                        setError(null);
                        setStatusMessage(null);
                      }}
                      value={username}
                    />
                  </label>
                  <label>
                    Senha
                    <span className="login-password-field">
                      <input
                        autoComplete="current-password"
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError(null);
                          setStatusMessage(null);
                        }}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                      />
                      <button
                        type="button"
                        className="password-visibility-toggle"
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          {showPassword ? (
                            <>
                              <path d="M3 3l18 18" />
                              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                              <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.7 4.4 9.5 6-.3.6-1.1 1.8-2.4 3" />
                              <path d="M6.2 6.2C3.9 7.6 2.7 9.8 2.5 11c.8 1.6 4.3 6 9.5 6 1 0 1.9-.2 2.8-.5" />
                            </>
                          ) : (
                            <>
                              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                              <circle cx="12" cy="12" r="2.5" />
                            </>
                          )}
                        </svg>
                      </button>
                    </span>
                  </label>
                  <div className="login-form-options">
                    <button type="button" className="login-text-button" onClick={() => {
                      setError(null);
                      setStatusMessage(null);
                      setScreen('reset');
                    }}>
                      Esqueceu sua senha?
                    </button>
                  </div>
                  {error && <p role="alert" className="login-error">{error}</p>}
                  {statusMessage && <p role="status" className="login-success">{statusMessage}</p>}
                  <button type="submit" className="login-submit">
                    Entrar no painel <span aria-hidden="true">→</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 id="login-title">Defina uma nova senha</h2>
                <p className="login-intro">
                  Como este é um ambiente de demonstração, você pode trocar a senha localmente neste navegador.
                </p>
                <form onSubmit={handlePasswordReset} className="login-form">
                  <label>
                    Nova senha
                    <input
                      autoComplete="new-password"
                      autoFocus
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        setError(null);
                      }}
                      type={showNewPasswords ? 'text' : 'password'}
                      value={newPassword}
                    />
                  </label>
                  <label>
                    Confirme a nova senha
                    <span className="login-password-field">
                      <input
                        autoComplete="new-password"
                        onChange={(event) => {
                          setConfirmPassword(event.target.value);
                          setError(null);
                        }}
                        type={showNewPasswords ? 'text' : 'password'}
                        value={confirmPassword}
                      />
                      <button
                        type="button"
                        className="password-visibility-toggle"
                        aria-label={showNewPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
                        aria-pressed={showNewPasswords}
                        onClick={() => setShowNewPasswords(!showNewPasswords)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          {showNewPasswords ? (
                            <>
                              <path d="M3 3l18 18" />
                              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                              <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.7 4.4 9.5 6-.3.6-1.1 1.8-2.4 3" />
                              <path d="M6.2 6.2C3.9 7.6 2.7 9.8 2.5 11c.8 1.6 4.3 6 9.5 6 1 0 1.9-.2 2.8-.5" />
                            </>
                          ) : (
                            <>
                              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                              <circle cx="12" cy="12" r="2.5" />
                            </>
                          )}
                        </svg>
                      </button>
                    </span>
                  </label>
                  {error && <p role="alert" className="login-error">{error}</p>}
                  <button type="submit" className="login-submit">
                    Salvar nova senha <span aria-hidden="true">→</span>
                  </button>
                  <button type="button" className="login-back-button" onClick={showLogin}>Voltar para entrar</button>
                </form>
              </>
            )}
            <div className="login-credentials">
              <span>Acesso de demonstração</span>
              <p>Usuário <strong>{DEMO_USERNAME}</strong><i /> Senha <strong>{demoPassword}</strong></p>
            </div>
            <p className="login-security-note"><span aria-hidden="true">●</span> Ambiente demonstrativo Stalse</p>
          </div>
        </section>
      </div>
    </main>
  );
}
