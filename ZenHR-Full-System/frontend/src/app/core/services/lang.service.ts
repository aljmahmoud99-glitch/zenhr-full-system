import { Injectable, computed } from '@angular/core';
import { I18nService, Lang } from './i18n.service';

@Injectable({ providedIn: 'root' })
export class LangService {
  readonly lang = computed<Lang>(() => this.i18n.currentLang);

  constructor(private i18n: I18nService) {}

  get isAr() {
    return this.i18n.currentLang === 'ar';
  }

  get dir() {
    return this.i18n.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  toggle() {
    this.i18n.toggle();
  }

  set(lang: Lang) {
    this.i18n.setLanguage(lang);
  }

  t(ar: string, en: string): string {
    return this.i18n.currentLang === 'ar' ? ar : en;
  }
}
