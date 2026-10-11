import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import AuthGate from './auth-gate';
import LogoutButton from './logout-button';
import NavLinks from './nav-links';
import OperatorField from './operator-field';

export const metadata: Metadata = {
  title: 'Atendimento Stalse',
  description: 'Pedidos e avaliações de clientes da Olist',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap"
        />
      </head>
      <body>
        <AuthGate
          nav={(
            <aside className="sidebar" aria-label="Navegação principal">
              <Link className="brand" href="/">
                <span className="brand-mark" aria-hidden="true">s</span>
                <span className="brand-text">
                  stalse
                  <small>Support desk</small>
                </span>
              </Link>
              <NavLinks />
              <div className="sidebar-footer">
                <OperatorField />
                <LogoutButton />
              </div>
            </aside>
          )}
        >
          {children}
        </AuthGate>
      </body>
    </html>
  );
}
