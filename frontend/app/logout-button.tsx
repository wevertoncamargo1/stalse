'use client';

import { signOut } from './auth';

export default function LogoutButton() {
  return (
    <button type="button" className="logout-button" onClick={signOut}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2H2v12h4v-2H4V4h2zM10 4.5 8.6 5.9 10.2 7.5H5v2h5.2l-1.6 1.6L10 12.5 14 8.5z" /></svg>
      Sair
    </button>
  );
}
