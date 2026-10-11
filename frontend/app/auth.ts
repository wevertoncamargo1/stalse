export const AUTH_STORAGE_KEY = 'stalse_auth';
export const AUTH_CHANGE_EVENT = 'stalse-auth-change';
export const DEMO_USERNAME = 'admin';
export const DEMO_PASSWORD = 'admin';
const DEMO_PASSWORD_STORAGE_KEY = 'stalse_demo_password';

export function getDemoPassword(): string {
  try {
    return window.localStorage.getItem(DEMO_PASSWORD_STORAGE_KEY) ?? DEMO_PASSWORD;
  } catch {
    return DEMO_PASSWORD;
  }
}

export function setDemoPassword(password: string): boolean {
  try {
    window.localStorage.setItem(DEMO_PASSWORD_STORAGE_KEY, password);
    return true;
  } catch {
    return false;
  }
}

export function isAuthenticated(): boolean {
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function signIn(username: string, password: string): boolean {
  if (username.trim() !== DEMO_USERNAME || password !== getDemoPassword()) return false;
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
