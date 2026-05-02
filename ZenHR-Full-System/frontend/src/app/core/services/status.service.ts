import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StatusService {
  
  getBadgeClass(status: string): string {
    const map: Record<string, string> = {
      'active': 'badge-success',
      'approved': 'badge-success',
      'paid': 'badge-success',
      'valid': 'badge-success',
      'present': 'badge-success',
      
      'pending': 'badge-info badge-pulse',
      'manager_approved': 'badge-info',
      'processing': 'badge-info',
      
      'probation': 'badge-purple',
      'draft': 'badge-neutral',
      
      'expiring_soon': 'badge-warning',
      'late': 'badge-warning',
      'warning': 'badge-warning',
      
      'expired': 'badge-danger',
      'rejected': 'badge-danger',
      'terminated': 'badge-danger',
      'absent': 'badge-danger',
      'cancelled': 'badge-neutral',
      'resigned': 'badge-gold',
      'on_leave': 'badge-purple',
      'holiday': 'badge-purple',
    };
    return map[status] ?? 'badge-neutral';
  }
}