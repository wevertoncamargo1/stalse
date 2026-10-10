import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import OperatorField from './operator-field';

export const metadata: Metadata = {
  title: 'Atendimento Stalse',
  description: 'Pedidos e avaliações de clientes da Olist',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <nav className="global-nav" aria-label="Navegação principal">
          <Link className="global-nav-brand" href="/">Stalse</Link>
          <div className="global-nav-links">
            <Link href="/tickets">Pedidos</Link>
            <Link href="/dashboard">Avaliações e métricas</Link>
          </div>
          <OperatorField />
        </nav>
        {children}
      </body>
    </html>
  );
}
