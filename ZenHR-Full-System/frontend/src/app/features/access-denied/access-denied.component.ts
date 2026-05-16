import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="access-denied-page" [attr.dir]="i18n.isRTL() ? 'rtl' : 'ltr'">
      <div class="access-card">
        <span class="material-icons">lock</span>
        <h1>{{ t('لا تملك صلاحية الوصول', 'Access denied') }}</h1>
        <p>{{ t('هذه الصفحة أو العملية غير متاحة لدورك الحالي. إذا كنت تحتاجها للعمل، تواصل مع مسؤول النظام.', 'This page or action is not available for your current role. Contact your administrator if you need access for your work.') }}</p>
        <a class="z-btn-primary" [routerLink]="homeUrl">{{ t('العودة إلى مساحة العمل', 'Back to workspace') }}</a>
      </div>
    </section>
  `,
  styles: [`
    .access-denied-page {
      min-height: 70vh;
      display: grid;
      place-items: center;
      padding: 32px;
    }
    .access-card {
      width: min(560px, 100%);
      border: 1px solid var(--z-border, rgba(148, 163, 184, .28));
      border-radius: 12px;
      background: var(--z-card, rgba(255, 255, 255, .04));
      color: var(--z-text, inherit);
      padding: 32px;
      text-align: center;
      box-shadow: var(--z-shadow, 0 18px 48px rgba(15, 23, 42, .14));
    }
    .material-icons {
      font-size: 44px;
      color: var(--z-warning, #f59e0b);
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.45rem;
    }
    p {
      margin: 0 auto 22px;
      max-width: 44ch;
      color: var(--z-muted, #64748b);
      line-height: 1.7;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccessDeniedComponent {
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);

  get homeUrl() {
    return this.auth.defaultHomeUrl();
  }

  t(ar: string, en: string) {
    return this.i18n.currentLang === 'ar' ? ar : en;
  }
}
