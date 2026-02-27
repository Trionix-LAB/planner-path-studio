export const APP_THEME_STORAGE_KEY = 'pps.theme';

export type AppTheme = 'dark' | 'light';

const hasWindow = (): boolean => typeof window !== 'undefined';

export const normalizeAppTheme = (value: unknown, fallback: AppTheme = 'dark'): AppTheme => {
  if (value === 'light' || value === 'dark') return value;
  return fallback;
};

export const readStoredAppTheme = (fallback: AppTheme = 'dark'): AppTheme => {
  if (!hasWindow()) return fallback;
  try {
    return normalizeAppTheme(window.localStorage.getItem(APP_THEME_STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
};

export const writeStoredAppTheme = (theme: AppTheme): void => {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors in private mode or restricted contexts.
  }
};

export const applyAppTheme = (theme: AppTheme): void => {
  if (!hasWindow()) return;
  const root = window.document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
};

export const initAppTheme = (fallback: AppTheme = 'dark'): AppTheme => {
  const theme = readStoredAppTheme(fallback);
  applyAppTheme(theme);
  return theme;
};
