import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="z-card">
      <div class="z-skeleton z-skeleton-card"></div>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonCardComponent {}
