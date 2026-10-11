'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  {
    href: '/',
    label: 'Início',
    exact: true,
    icon: <path d="M8 1.5 1.5 7v7.5h4.5V10h4v4.5h4.5V7z" />,
  },
  {
    href: '/tickets',
    label: 'Pedidos',
    icon: <path d="M1.5 2h4v12h-4zM6.5 2h3v8h-3zM10.5 2h4v10h-4z" />,
  },
  {
    href: '/dashboard',
    label: 'Avaliações e métricas',
    icon: <path d="M1.5 14.5h13v-1.5h-13zM2.5 12h2.5V7H2.5zM6.75 12h2.5V3h-2.5zM11 12h2.5V9H11z" />,
  },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav">
      <span className="sidebar-section">Operação</span>
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? 'is-active' : undefined}
            aria-current={active ? 'page' : undefined}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">{link.icon}</svg>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
