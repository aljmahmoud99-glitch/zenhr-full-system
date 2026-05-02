import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'icon',
  standalone: true
})
export class IconPipe implements PipeTransform {
  private readonly iconMap: Record<string, string> = {
    'user-plus': 'person_add',
    'user': 'person',
    'users': 'groups',
    'file-text': 'description',
    'check-square': 'fact_check',
    'clock': 'schedule',
    'user-check': 'how_to_reg',
    'bell': 'notifications',
    'id-card': 'badge',
    'banknote': 'payments',
    'calendar-check': 'event_available',
    'hourglass': 'more_time',
    'wallet': 'account_balance_wallet',
    'bar-chart-2': 'bar_chart',
    'plus': 'add',
    'pencil': 'edit',
    'trash-2': 'delete',
    'chevron-right': 'chevron_right',
    'chevron-left': 'chevron_left',
    'x': 'close',
    'more-horizontal': 'more_horiz',
    'calendar': 'calendar_today',
    'package': 'inventory_2',
    'plus-circle': 'add_circle',
    'log-out': 'logout',
    'refresh-cw': 'autorenew',
    'calendar-x': 'event_busy',
    'party-popper': 'celebration',
    'layout-dashboard': 'dashboard',
    'grid': 'grid_view',
    'calendar-range': 'calendar_view_week',
    'move-horizontal': 'swap_horiz',
    'sparkles': 'auto_awesome',
    'arrow-right': 'arrow_forward',
    'arrow-left': 'arrow_back',
    'clipboard-check': 'assignment_turned_in',
    'check-circle': 'done_all',
    'mic': 'record_voice_over',
    'search-x': 'search_off',
    'shield-check': 'verified_user',
    'folder': 'folder_open',
    'building-2': 'domain',
    'users-cog': 'manage_accounts',
    'user-cog': 'manage_accounts'
  };

  transform(iconName: string): string {
    if (!iconName) return 'circle';
    return this.iconMap[iconName] || iconName;
  }
}
