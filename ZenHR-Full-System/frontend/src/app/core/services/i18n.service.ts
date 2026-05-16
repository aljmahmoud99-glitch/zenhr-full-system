import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type Lang = 'ar' | 'en';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly isBrowser: boolean;
  private readonly current = signal<Lang>('ar');
  private readonly initialized = signal(false);
  private readonly loading = signal(false);
  private readonly cleanArabicCache = new Map<string, string>();
  private windows1256Reverse: Map<string, number> | null = null;

  readonly lang = this.current.asReadonly();
  readonly ready = computed(() => this.initialized() && !this.loading());
  readonly isRTL = computed(() => this.current() === 'ar');
  readonly isArabic = computed(() => this.current() === 'ar');

  constructor(
    private translate: TranslateService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.translate.addLangs(['ar', 'en']);
    this.translate.setDefaultLang('ar');
    this.applyDocumentLanguage(this.current());
  }

  get currentLang(): Lang {
    return this.current();
  }

  ensureInitialized() {
    if (this.initialized()) {
      return;
    }

    const saved = this.isBrowser ? (localStorage.getItem('zenjo_lang') as Lang | null) : null;
    const initialLang: Lang = saved === 'en' ? 'en' : 'ar';
    this.setLanguage(initialLang);
  }

  setLanguage(lang: Lang) {
    if (this.current() === lang && this.initialized() && !this.loading()) {
      this.applyDocumentLanguage(lang);
      return;
    }

    this.loading.set(true);
    this.current.set(lang);
    this.applyDocumentLanguage(lang);

    this.translate.use(lang).subscribe({
      next: () => {
        this.persistLanguage(lang);
        this.initialized.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.persistLanguage(lang);
        this.initialized.set(true);
        this.loading.set(false);
      }
    });
  }

  toggle() {
    this.setLanguage(this.current() === 'ar' ? 'en' : 'ar');
  }

  instant(key: string, params?: object) {
    return this.cleanArabicText(this.translate.instant(key, params));
  }

  t(key: string, fallback = '', params?: object) {
    const translated = this.translate.instant(key, params);
    return this.cleanArabicText(translated && translated !== key ? translated : fallback);
  }

  cleanArabicText(value: string): string {
    if (!value || !/[طظØÙÛÃÂï�]/.test(value)) return value;
    const cached = this.cleanArabicCache.get(value);
    if (cached != null) return cached;

    const repaired = this.tryRepairWindows1256Mojibake(value);
    const result = repaired || value;
    if (this.cleanArabicCache.size > 2000) this.cleanArabicCache.clear();
    this.cleanArabicCache.set(value, result);
    return result;
  }

  private persistLanguage(lang: Lang) {
    if (this.isBrowser) {
      localStorage.setItem('zenjo_lang', lang);
    }
  }

  private applyDocumentLanguage(lang: Lang) {
    const direction = lang === 'ar' ? 'rtl' : 'ltr';
    this.document.documentElement.lang = lang;
    this.document.documentElement.dir = direction;
    this.document.body.lang = lang;
    this.document.body.dir = direction;
    this.document.body.classList.toggle('ltr', lang === 'en');
    this.document.body.classList.toggle('rtl', lang === 'ar');
  }

  private tryRepairWindows1256Mojibake(value: string): string | null {
    try {
      const utf8 = new TextDecoder('utf-8', { fatal: true });
      if (!this.windows1256Reverse) {
        const decoder = new TextDecoder('windows-1256');
        const reverse = new Map<string, number>();
        for (let i = 0; i <= 255; i++) {
          reverse.set(decoder.decode(Uint8Array.of(i)), i);
        }
        this.windows1256Reverse = reverse;
      }

      const bytes: number[] = [];
      for (const ch of value) {
        const b = this.windows1256Reverse.get(ch);
        if (b == null) return null;
        bytes.push(b);
      }
      const repaired = utf8.decode(Uint8Array.from(bytes));
      if (!/[\u0600-\u06ff]/.test(repaired) || /�/.test(repaired)) return null;
      return repaired;
    } catch {
      return null;
    }
  }
}
