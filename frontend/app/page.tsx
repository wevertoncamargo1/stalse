import Link from 'next/link';

const FEATURES = [
  {
    label: 'VISÃO CLARA',
    title: 'Tudo no seu lugar',
    text: 'Pedidos organizados por status, com prioridade visível para sua equipe saber por onde começar.',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="10" rx="1.5" />
        <rect x="12" y="3" width="5" height="6" rx="1.5" />
        <rect x="12" y="10" width="5" height="3" rx="1.5" />
      </>
    ),
  },
  {
    label: 'BUSCA RÁPIDA',
    title: 'Encontre o que importa',
    text: 'Localize pedidos por código, cidade ou categoria e vá direto ao contexto do atendimento.',
    icon: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="m12 12 3.5 3.5" />
      </>
    ),
  },
  {
    label: 'FLUXO INTELIGENTE',
    title: 'Acompanhe cada mudança',
    text: 'Status e prioridades em um só lugar, com auditoria automatizada das principais mudanças.',
    icon: (
      <>
        <path d="M3 5h10M3 9h7M3 13h5" />
        <path d="m12 12 2 2 3-4" />
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <main className="page-shell home-page">
      <section className="hero home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">OPERAÇÃO COM CONTEXTO · STALSE</p>
          <h1>
            Seus pedidos em ordem.
            <br />
            Sua equipe <span>no controle.</span>
          </h1>
          <p className="home-hero-description">
            Transforme pedidos e avaliações em uma operação mais clara. Encontre o que importa,
            priorize cada atendimento e acompanhe tudo em um só lugar.
          </p>
          <div className="hero-actions">
            <Link href="/tickets" className="primary-button">
              Explorar pedidos <span aria-hidden="true">→</span>
            </Link>
            <Link href="/dashboard" className="ghost-button">Ver avaliações e métricas</Link>
          </div>
          <p className="home-hero-note">
            <span aria-hidden="true" /> Mais contexto para decidir o próximo passo.
          </p>
        </div>

        <div className="home-preview" aria-label="Prévia ilustrativa do quadro de pedidos">
          <div className="preview-window">
            <div className="preview-topbar">
              <div className="preview-brand">
                <span className="preview-brand-mark" aria-hidden="true">s</span>
                <span>Pedidos</span>
              </div>
              <span className="preview-view-label">VISÃO GERAL</span>
            </div>
            <div className="preview-heading">
              <div>
                <span className="preview-overline">SUA OPERAÇÃO</span>
                <h2>Um time. Uma visão.</h2>
              </div>
              <span className="preview-filter">Hoje <span aria-hidden="true">⌄</span></span>
            </div>
            <div className="preview-board">
              <div className="preview-column">
                <div className="preview-column-title"><i className="preview-dot dot-new" />Abertos<span>3</span></div>
                <div className="preview-order-card">
                  <span className="preview-order-id">#10482</span>
                  <strong>Pedido aguardando retorno</strong>
                  <span className="preview-order-meta"><i className="priority-marker marker-high" />Prioridade alta</span>
                </div>
                <div className="preview-order-card">
                  <span className="preview-order-id">#10479</span>
                  <strong>Dúvida sobre a entrega</strong>
                  <span className="preview-order-meta"><i className="priority-marker marker-medium" />Prioridade média</span>
                </div>
              </div>
              <div className="preview-column">
                <div className="preview-column-title"><i className="preview-dot dot-progress" />Em andamento<span>2</span></div>
                <div className="preview-order-card">
                  <span className="preview-order-id">#10465</span>
                  <strong>Acompanhar avaliação</strong>
                  <span className="preview-order-meta"><i className="priority-marker marker-low" />Prioridade baixa</span>
                </div>
                <div className="preview-drop-card">
                  <span aria-hidden="true">＋</span>
                  Organize por etapa
                </div>
              </div>
            </div>
            <div className="preview-footer">
              <span><i aria-hidden="true" /> VISÃO KANBAN</span>
              <span>Arraste para organizar <b aria-hidden="true">↗</b></span>
            </div>
          </div>
          <div className="preview-float-card">
            <span className="preview-float-icon" aria-hidden="true">✓</span>
            <span><strong>Mais clareza</strong><small>em cada atendimento</small></span>
          </div>
          <span className="preview-orbit preview-orbit-one" aria-hidden="true" />
          <span className="preview-orbit preview-orbit-two" aria-hidden="true" />
        </div>
        <span className="home-hero-glow" aria-hidden="true" />
      </section>

      <section className="home-benefits" aria-label="Benefícios do painel">
        <div className="home-benefits-heading">
          <span>DO PRIMEIRO CLIQUE À RESOLUÇÃO</span>
          <h2>Menos procura. Mais ação.</h2>
        </div>
        <div className="feature-grid home-feature-grid">
          {FEATURES.map((feature, index) => (
            <article className="feature-card home-feature-card" key={feature.title}>
              <div className="feature-card-top">
                <span className="feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {feature.icon}
                  </svg>
                </span>
                <span className="feature-index">0{index + 1}</span>
              </div>
              <span className="feature-label">{feature.label}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
        <div className="home-bottom-cta">
          <span>Pronto para colocar os pedidos em perspectiva?</span>
          <Link href="/tickets">Acesse o quadro <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}
