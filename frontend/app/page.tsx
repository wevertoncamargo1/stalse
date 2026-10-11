import Link from 'next/link';

const FEATURES = [
  {
    title: 'Quadro kanban',
    text: 'Pedidos organizados por status, com arrastar e soltar e prioridade visível em cada card.',
  },
  {
    title: 'Busca em 100 mil pedidos',
    text: 'Por código, cliente, cidade (com ou sem acento) ou categoria, com resposta em milissegundos.',
  },
  {
    title: 'Auditoria automatizada',
    text: 'Mudanças de status disparam o fluxo n8n, que gera um relatório de auditoria com IA local.',
  },
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Data · Growth · Partner</p>
        <h1>
          Atendimento orientado por <span>dados</span>
        </h1>
        <p>
          Pedidos, prioridades e avaliações dos clientes da Olist em um só painel, para a equipe decidir
          o que atender primeiro.
        </p>
        <div className="hero-actions">
          <Link href="/tickets" className="primary-button">Abrir quadro de pedidos</Link>
          <Link href="/dashboard" className="ghost-button">Ver métricas</Link>
        </div>
      </section>
      <section className="feature-grid">
        {FEATURES.map((feature, index) => (
          <article className="feature-card" key={feature.title}>
            <span className="feature-index">0{index + 1}</span>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
