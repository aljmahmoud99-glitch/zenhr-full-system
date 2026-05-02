import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangePasswordComponent {
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  loading = signal(false);
  error = signal('');

  constructor(public auth: AuthService, private router: Router) {}

  get lang() {
    return this.auth.lang;
  }

  submit() {
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.error.set(this.lang === 'ar' ? 'يرجى تعبئة جميع الحقول.' : 'Please complete all fields.');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error.set(this.lang === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl(this.auth.defaultHomeUrl());
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || (this.lang === 'ar' ? 'تعذر تغيير كلمة المرور.' : 'Failed to change password.'));
      }
    });
  }
}
