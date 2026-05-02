import { Pipe, PipeTransform } from '@angular/core';
import { LangService } from '../services/lang.service';

@Pipe({ name: 'tr', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  constructor(private lang: LangService) {}
  transform(key: { ar: string; en: string }): string {
    return this.lang.isAr ? key.ar : key.en;
  }
}