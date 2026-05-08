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
    if (this.isBrowser) {
      localStorage.setItem('zenjo_theme', theme);
    }
  }
}
