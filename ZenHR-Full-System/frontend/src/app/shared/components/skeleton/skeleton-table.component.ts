import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="z-table-wrapper skeleton-table-shell">
      <div class="z-table-toolbar">
        <div class="z-skeleton z-skeleton-text skeleton-toolbar-title"></div>
        <div class="z-skeleton z-skeleton-text skeleton-toolbar-filter"></div>
      </div>

      <div class="skeleton-table">
        <div class="skeleton-row skeleton-head" [style.gridTemplateColumns]="'repeat(' + cols() + ', minmax(0, 1fr))'">
          <span class="z-skeleton z-skeleton-text" *ngFor="let item of columnItems"></span>
        </div>

        <div class="skeleton-row" *ngFor="let row of rowItems" [style.gridTemplateColumns]="'repeat(' + cols() + ', minmax(0, 1fr))'">
          <span class="z-skeleton z-skeleton-row" *ngFor="let item of columnItems"></span>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .skeleton-table-shell {
      overflow: hidden;
    }

    .skeleton-toolbar-title {
      width: 180px;
    }

    .skeleton-toolbar-filter {
      width: 120px;
      margin-inline-start: auto;
    }

    .skeleton-table {
      display: grid;
      gap: 0;
    }

    .skeleton-row {
      display: grid;
      gap: 12px;
      padding: 14px 16px;
      border-top: 1px solid var(--z-border);
    }

    .skeleton-head {
      background: #f8fafb;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonTableComponent {
  readonly rows = input(8);
  readonly cols = input(6);

  get rowItems() {
    return Array.from({ length: this.rows() });
  }

  get columnItems() {
    return Array.from({ length: this.cols() });
  }
}
