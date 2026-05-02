
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ApiResponse } from '../../../core/models';

interface RegForm {
  companyNameAr: string; companyNameEn: string; commercialRegNo: string;
  contactEmail: string; contactPhone: string; planType: string; notes: string;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  step = signal(1);
  loading = signal(false);
  submitted = signal(false);
  error = signal<string | null>(null);

  form: RegForm = {
    companyNameAr: '', companyNameEn: '', commercialRegNo: '',
    contactEmail: '', contactPhone: '', planType: 'starter', notes: ''
  };

  planOptions = [
    { value: 'trial',        label: 'تجريبي',         desc: 'مجاني، حتى 10 موظفين، 30 يوماً',    price: 'مجاني' },
    { value: 'starter',      label: 'مبتدئ',           desc: 'حتى 50 موظفاً',                     price: '99 JOD / شهر' },
    { value: 'professional', label: 'احترافي',         desc: 'حتى 200 موظف، تقارير متقدمة',      price: '249 JOD / شهر' },
    { value: 'enterprise',   label: 'مؤسسي',           desc: 'غير محدود، دعم مخصص',               price: 'تواصل معنا' },
  ];

  constructor(private http: HttpClient, private router: Router) {}

  nextStep() {
    if (this.step() === 1 && !this.validateStep1()) return;
    this.step.update(s => s + 1);
  }

  prevStep() { this.step.update(s => s - 1); }

  validateStep1(): boolean {
    if (!this.form.companyNameAr.trim()) { this.error.set('اسم الشركة بالعربي مطلوب'); return false; }
    if (!this.form.contactEmail.includes('@')) { this.error.set('البريد الإلكتروني غير صالح'); return false; }
    this.error.set(null); return true;
  }

  submit() {
    this.loading.set(true);
    this.error.set(null);
    this.http.post<ApiResponse<any>>('/api/register/company', this.form).subscribe({
      next: (res) => { this.loading.set(false); this.submitted.set(true); },
      error: (e) => { this.loading.set(false); this.error.set(e.error?.message ?? 'حدث خطأ، يرجى المحاولة مجدداً'); }
    });
  }

  selectedPlanLabel(): string {
    return this.planOptions.find(p => p.value === this.form.planType)?.label ?? '';
  }
}
