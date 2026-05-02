/*
 * Phase 1 — canDo Structural Directive
 *
 * Usage: *canDo="'employees:create'"
 *        *canDo="'leave:approve'"
 *
 * Structurally removes the host element if the current user does not have
 * the specified permission. Reads from the locally cached permission map
 * in RoleAccessService — no HTTP call per use.
 *
 * Format: 'screen:action'  e.g. 'employees:view', 'payroll:approve'
 */
import {
  Directive, Input, OnInit, OnDestroy,
  TemplateRef, ViewContainerRef,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { RoleAccessService } from '../services/role-access.service';

@Directive({
  selector: '[canDo]',
  standalone: true,
})
export class CanDoDirective implements OnInit, OnDestroy {
  @Input() set canDo(value: string) {
    this._key = value;
    this._apply();
  }

  private _key = '';
  private _hasView = false;
  private _destroy$ = new Subject<void>();

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private access: RoleAccessService,
  ) {}

  ngOnInit() {
    // Re-evaluate when the permission map is refreshed (e.g. after login)
    this.access.permissionMap$.pipe(takeUntil(this._destroy$)).subscribe(() => {
      this._apply();
    });
  }

  ngOnDestroy() {
    this._destroy$.next();
    this._destroy$.complete();
  }

  private _apply() {
    const [screen, action] = this._key.split(':');
    const allowed = this.access.canDoSync(screen ?? '', action ?? 'view');

    if (allowed && !this._hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this._hasView = true;
    } else if (!allowed && this._hasView) {
      this.viewContainer.clear();
      this._hasView = false;
    }
  }
}
