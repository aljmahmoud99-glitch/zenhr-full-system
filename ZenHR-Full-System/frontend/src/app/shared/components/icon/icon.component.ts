import { Component, Input } from '@angular/core';
import { LucideAngularModule, LucideIcon } from 'lucide-angular';
import { IconPipe } from './icon.pipe';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [LucideAngularModule],
  template: `<lucide-icon [name]="iconName" [size]="size" [class]="className"></lucide-icon>`,
  styles: []
})
export class IconComponent {
  @Input() name: string = 'circle';
  @Input() size: number = 20;
  @Input() className: string = '';

  private pipe = new IconPipe();

  get iconName(): string {
    return this.pipe.transform(this.name);
  }
}