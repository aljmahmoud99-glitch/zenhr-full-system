import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'z-accordion',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './accordion.component.scss',
  template: `
    <div class="accordion">
      <ng-content></ng-content>
    </div>
  `
})
export class AccordionComponent {}

@Component({
  selector: 'z-accordion-panel',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './accordion.component.scss',
  template: `
    <div class="acc-panel" [class.acc-open]="isOpen">
      <button class="acc-header" (click)="toggle()">
        <span class="acc-icon-wrap">
          <ng-container *ngIf="icon">
            <span *ngIf="isMaterialIcon" class="material-icons acc-icon-material">{{ icon }}</span>
            <span *ngIf="!isMaterialIcon" class="acc-icon">{{ icon }}</span>
          </ng-container>
        </span>
        <span class="acc-title">{{ title }}</span>
        <span class="acc-count" *ngIf="count !== undefined && count !== null">{{ count }}</span>
        <svg class="acc-chevron" [class.rotated]="isOpen" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div class="acc-body" [@collapse]="isOpen ? 'open' : 'closed'">
        <div class="acc-content">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  animations: [
    trigger('collapse', [
      state('closed', style({ height: '0px', opacity: 0, overflow: 'hidden' })),
      state('open', style({ height: '*', opacity: 1 })),
      transition('closed <=> open', animate('220ms cubic-bezier(0.4, 0, 0.2, 1)'))
    ])
  ]
})
export class AccordionPanelComponent implements OnInit {
  @Input() title = '';
  @Input() icon?: string;
  @Input() count?: number;
  @Input() openByDefault = false;
  isOpen = false;

  get isMaterialIcon(): boolean {
    return !!this.icon && /^[a-z][a-z0-9_]*$/.test(this.icon);
  }

  ngOnInit() {
    this.isOpen = this.openByDefault;
  }

  toggle() {
    this.isOpen = !this.isOpen;
  }
}
