
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-subscription-expired',
  standalone: true,
  template: `
    <div class="expired-screen">
      <div class="expired-card">
        <div class="expired-icon">⏰</div>
        <h1>انتهت صلاحية الاشتراك</h1>
        <p>اشتراك شركتك في منصة ZenJO قد انتهى. يرجى التواصل مع مسؤول المنصة لتجديد اشتراكك.</p>
        <div class="expired-actions">
          <a href="mailto:support@zenjo.jo" class="btn btn-primary">تواصل مع الدعم</a>
          <button class="btn btn-ghost" (click)="logout()">تسجيل خروج</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .expired-screen {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: var(--surface-bg, #f8fafc); font-family: 'Cairo', sans-serif; direction: rtl;
    }
    .expired-card {
      background: white; border-radius: 16px; padding: 48px 40px; text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12); max-width: 480px; width: 100%;
    }
    .expired-icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 1.5rem; color: #1e293b; margin: 0 0 12px; }
    p { color: #64748b; line-height: 1.7; margin-bottom: 32px; }
    .expired-actions { display: flex; gap: 12px; justify-content: center; }
    .btn { padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 0.95rem; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; border: none; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-ghost { background: transparent; color: #64748b; border: 1px solid #e2e8f0; }
  `]
})
export class SubscriptionExpiredComponent {
  constructor(private auth: AuthService, private router: Router) {}
  logout() { this.auth.logout(); }
}
