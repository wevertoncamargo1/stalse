export const AUTH_STORAGE_KEY = 'stalse_auth';
export const AUTH_CHANGE_EVENT = 'stalse-auth-change';
export const DEMO_USERNAME = 'admin';
export const DEMO_PASSWORD = 'admin';

export function isAuthenticated(): boolean {
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function signIn(username: string, password: string): boolean {
  if (username.trim() !== DEMO_USERNAME || password !== DEMO_PASSWORD) return false;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, '1');
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  return true;
}

export function signOut(): void {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}
