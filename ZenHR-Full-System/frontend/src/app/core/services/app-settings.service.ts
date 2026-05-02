import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

type SettingItem = {
  key: string;
  value: string;
};

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private readonly api = inject(ApiService);
  private readonly settingsMap = signal<Record<string, string>>({});
  private readonly loaded = signal(false);
  private loadingPromise: Promise<void> | null = null;

  readonly currencyCode = computed(() => this.value('currency_code', 'JOD').toUpperCase());

  async ensureLoaded(): Promise<void> {
    if (this.loaded()) {
      return;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.fetchSettings().finally(() => {
        this.loadingPromise = null;
      });
    }

    await this.loadingPromise;
  }

  async refresh(): Promise<void> {
    await this.fetchSettings();
  }

  value(key: string, fallback = ''): string {
    return this.settingsMap()[key] ?? fallback;
  }

  boolValue(key: string, fallback = false): boolean {
    const raw = this.value(key, fallback ? 'true' : 'false').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  intValue(key: string, fallback = 0): number {
    const parsed = Number.parseInt(this.value(key, String(fallback)), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  decimalValue(key: string, fallback = 0): number {
    const parsed = Number.parseFloat(this.value(key, String(fallback)));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  formatMoney(value: number | null | undefined, currencyCode?: string): string {
    return `${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(value ?? 0)} ${(currencyCode ?? this.currencyCode())}`;
  }

  private async fetchSettings(): Promise<void> {
    const response = await firstValueFrom(this.api.get<any>('/api/config'));
    const items: SettingItem[] = response?.data ?? [];
    const nextMap = items.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.value ?? '';
      return acc;
    }, {});
    this.settingsMap.set(nextMap);
    this.loaded.set(true);
  }
}
