import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly isBrowser: boolean;
  private readonly current = signal<ThemeMode>('light');
  readonly theme = this.current.asReadonly();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    const saved = this.isBrowser ? localStorage.getItem('zenjo_theme') : null;
    this.setTheme(saved === 'dark' ? 'dark' : 'light');
  }

  get currentTheme(): ThemeMode {
    return this.current();
  }

  toggle() {
    this.setTheme(this.current() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: ThemeMode) {
    this.current.set(theme);
    this.document.documentElement.dataset['theme'] = theme;
    this.document.body.dataset['theme'] = theme;
    this.document.body.classList.toggle('theme-dark', theme === 'dark');
    this.document.body.classList.toggle('theme-light', theme === 'light');
    const root = this.document.documentElement;
    const tokens = theme === 'dark'
      ? {
          '--z-text-primary': '#eef8f3',
          '--z-text-secondary': '#b7c9c0',
          '--z-text-muted': '#83978e',
          '--z-border': 'rgba(191, 219, 207, 0.14)',
          '--z-border-strong': 'rgba(191, 219, 207, 0.24)',
          '--z-surface': '#111c18',
          '--z-surface-muted': '#0d1713',
          '--z-surface-strong': '#17241f',
          '--surface': '#111c18',
          '--surface-elevated': '#17241f',
          '--surface-muted': '#0d1713',
          '--foreground': '#eef8f3',
          '--foreground-muted': '#b7c9c0',
          '--border': 'rgba(191, 219, 207, 0.14)',
          '--dropdown-bg': '#111c18',
          '--dropdown-text': '#eef8f3',
          '--dropdown-hover': 'rgba(var(--app-primary-rgb), 0.16)',
          '--header-bg': 'rgba(17, 28, 24, 0.92)',
          '--header-text': '#eef8f3',
          '--card-bg': 'rgba(17, 28, 24, 0.94)',
          '--input-bg': '#0d1713'
        }
      : {
          '--z-text-primary': '#14211c',
          '--z-text-secondary': '#52655d',
          '--z-text-muted': '#7f9189',
          '--z-border': '#e3e9e5',
          '--z-border-strong': '#cfd8d2',
          '--z-surface': '#ffffff',
          '--z-surface-muted': '#f7faf8',
          '--z-surface-strong': '#eef4f0',
          '--surface': '#ffffff',
          '--surface-elevated': '#ffffff',
          '--surface-muted': '#f7faf8',
          '--foreground': '#14211c',
          '--foreground-muted': '#52655d',
          '--border': '#e3e9e5',
          '--dropdown-bg': '#ffffff',
          '--dropdown-text': '#14211c',
          '--dropdown-hover': 'rgba(var(--app-primary-rgb), 0.08)',
          '--header-bg': 'rgba(255, 255, 255, 0.92)',
          '--header-text': '#14211c',
          '--card-bg': 'rgba(255, 255, 255, 0.96)',
          '--input-bg': '#ffffff'
        };
    Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value));
    if (this.isBrowser) {
      localStorage.setItem('zenjo_theme', theme);
    }
  }
}
