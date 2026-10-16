import { useSyncExternalStore } from 'react';

const query = window.matchMedia('(prefers-color-scheme: dark)');

export type ColorScheme = 'light' | 'dark';

const current = (): ColorScheme => (query.matches ? 'dark' : 'light');

/** Follow the system appearance by toggling the `dark` class on <html>. Call once at startup. */
export function syncColorScheme() {
  const apply = () => document.documentElement.classList.toggle('dark', query.matches);
  apply();
  query.addEventListener('change', apply);
}

export function useColorScheme() {
  return useSyncExternalStore((onChange) => {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, current);
}
