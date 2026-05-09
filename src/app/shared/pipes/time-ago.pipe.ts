import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeAgo',
  standalone: true
})
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) return '';

    const date = typeof value === 'string' ? new Date(value) : value;
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) {
      return 'just now';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      if (minutes === 1) return 'last minute';
      return `last ${minutes} minutes`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      if (hours === 1) return 'last hour';
      return `last ${hours} hours`;
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
      if (days === 1) return 'last day';
      return `last ${days} days`;
    }

    const weeks = Math.floor(days / 7);
    if (days < 30) {
      if (weeks === 1) return 'last week';
      return `last ${weeks} weeks`;
    }

    const months = Math.floor(days / 30);
    if (days < 365) {
      if (months === 1) return 'last month';
      return `last ${months} months`;
    }

    const years = Math.floor(days / 365);
    if (years === 1) return 'last year';
    return `last ${years} years`;
  }
}
