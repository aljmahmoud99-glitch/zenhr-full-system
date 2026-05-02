import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-kpi-cards',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid-4 skeleton-kpi-grid">
      <article class="z-card z-kpi-card" *ngFor="let item of items">
        <div class="z-skeleton z-skeleton-text skeleton-kpi-label"></div>
        <div class="z-skeleton skeleton-kpi-value"></div>
        <div class="z-skeleton z-skeleton-text skeleton-kpi-meta"></div>
      </article>
    </div>
  `,
  styles: [`
    .skeleton-kpi-grid {
      margin-bottom: var(--z-space-4);
    }

    .skeleton-kpi-label {
      width: 45%;
      margin-bottom: 18px;
    }

    .skeleton-kpi-value {
      height: 34px;
      width: 62%;
      border-radius: var(--z-radius-sm);
      margin-bottom: 14px;
    }

    .skeleton-kpi-meta {
      width: 55%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonKpiCardsComponent {
  readonly count = input(4);

  get items() {
    return Array.from({ length: this.count() });
  }
}
