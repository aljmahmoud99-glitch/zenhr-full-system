import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nService } from './core/services/i18n.service';
import { AppSettingsService } from './core/services/app-settings.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  template: `
    <ng-container *ngIf="i18n.ready(); else booting">
      <router-outlet />
    </ng-container>

    <ng-template #booting>
      <div class="app-boot" [attr.dir]="i18n.isRTL() ? 'rtl' : 'ltr'" [attr.lang]="i18n.currentLang">
        <div class="app-boot-card">
          <div class="app-boot-logo">Z</div>
          <div class="app-boot-name">ZenJO</div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }

    .app-boot {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at top right, rgba(94, 215, 161, 0.12), transparent 24%),
        radial-gradient(circle at bottom left, rgba(18, 53, 36, 0.08), transparent 28%),
        linear-gradient(180deg, #eef3ef 0%, #f7faf8 100%);
    }

    .app-boot-card {
      display: grid;
      justify-items: center;
      gap: 12px;
      padding: 28px 32px;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(20, 33, 28, 0.08);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
    }

    .app-boot-logo {
      width: 56px;
      height: 56px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: linear-gradient(135deg, #2ab487 0%, #208963 100%);
      color: #fff;
      font-size: 28px;
      font-weight: 800;
    }

    .app-boot-name {
      font-size: 18px;
      font-weight: 800;
      color: #14211c;
    }
  `]
})
export class AppComponent implements OnInit {
  constructor(
    public i18n: I18nService,
    private settings: AppSettingsService
  ) {}

  ngOnInit() {
    this.i18n.ensureInitialized();
    void this.settings.ensureLoaded();
  }
}
