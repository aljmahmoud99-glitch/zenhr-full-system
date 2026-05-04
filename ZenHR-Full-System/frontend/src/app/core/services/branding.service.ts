import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface BrandingData {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string | null;
  onPrimary?: string;
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly api = inject(ApiService);

  readonly logoUrl = signal<string>('');
  readonly branding = signal<BrandingData>({});

  async loadAndApply(): Promise<void> {
    const token = localStorage.getItem('zenjo_token');
    if (!token) return;
    try {
      const r = await firstValueFrom(this.api.get<any>('/api/branding'));
      if (r?.success && r.data) {
        this.branding.set(r.data);
        this.logoUrl.set(r.data.logoUrl ?? '');
        this.applyToDocument(r.data);
      }
    } catch {
      // Silently use CSS defaults
    }
  }

  applyToDocument(data: BrandingData): void {
    const root = document.documentElement;
    if (data.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(data.primaryColor)) {
      root.style.setProperty('--app-primary', data.primaryColor);
      root.style.setProperty('--app-primary-dark', this.darken(data.primaryColor, 0.5));
      root.style.setProperty('--app-primary-light', this.lighten(data.primaryColor, 0.42));
      root.style.setProperty('--app-on-primary', this.getOnColor(data.primaryColor));
    }
    if (data.secondaryColor && /^#[0-9A-Fa-f]{6}$/.test(data.secondaryColor)) {
      root.style.setProperty('--app-secondary', data.secondaryColor);
    }
    if (data.accentColor && /^#[0-9A-Fa-f]{6}$/.test(data.accentColor)) {
      root.style.setProperty('--app-accent', data.accentColor);
    }
  }

  resetToDefault(): void {
    const root = document.documentElement;
    ['--app-primary', '--app-primary-dark', '--app-primary-light',
     '--app-on-primary', '--app-secondary', '--app-accent']
      .forEach(v => root.style.removeProperty(v));
    this.branding.set({});
    this.logoUrl.set('');
  }

  private hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '').padEnd(6, '0');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b]
      .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('');
  }

  darken(hex: string, amount: number): string {
    const [r, g, b] = this.hexToRgb(hex);
    return this.rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  }

  lighten(hex: string, amount: number): string {
    const [r, g, b] = this.hexToRgb(hex);
    return this.rgbToHex(
      r + (255 - r) * amount,
      g + (255 - g) * amount,
      b + (255 - b) * amount,
    );
  }

  getOnColor(hex: string): string {
    const [r, g, b] = this.hexToRgb(hex);
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return 1.05 / (L + 0.05) >= 4.5 ? '#ffffff' : '#0f172a';
  }
}
