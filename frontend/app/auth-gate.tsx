'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { AUTH_CHANGE_EVENT, isAuthenticated } from './auth';

export default function AuthGate({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const onLoginPage = pathname === '/login';

  useEffect(() => {
    const sync = () => setAuthed(isAuthenticated());
    sync();
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (authed === null) return;
    if (!authed && !onLoginPage) router.replace('/login');
    if (authed && onLoginPage) router.replace('/');
  }, [authed, onLoginPage, router]);

  if (onLoginPage) return <>{children}</>;
  if (!authed) return null;
  return (
    <div className="app-shell">
      {nav}
      <div className="app-main">{children}</div>
    </div>
  );
}
