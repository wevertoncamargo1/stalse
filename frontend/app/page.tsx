import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <h1>Stalse Support Desk</h1>
      <p>Pedidos e avaliações de clientes a partir dos dados públicos da Olist.</p>
      <div className="nav-grid">
        <Link href="/tickets">Pedidos</Link>
        <Link href="/dashboard">Avaliações</Link>
      </div>
    </main>
  );
}
