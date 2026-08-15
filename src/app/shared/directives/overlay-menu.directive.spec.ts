import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayMenuDirective } from './overlay-menu.directive';

@Component({
  imports: [OverlayMenuDirective],
  template: `
    <button
      type="button"
      [appOverlayMenu]="menu"
      [appOverlayMenuData]="{ label: 'Archived Act' }"
      [appOverlayMenuCloseOnSelect]="true"
      [appOverlayMenuFocusOnOpen]="true"
    >
      Actions
    </button>

    <ng-template #menu let-label="label">
      <div class="overlay-menu">
        <button class="menu-item" type="button" (click)="selected = 'restore:' + label">
          Restore {{ label }}
        </button>
        <button class="menu-item" type="button" (click)="selected = 'delete:' + label">
          Delete {{ label }}
        </button>
      </div>
    </ng-template>
  `,
})
class OverlayMenuTestHost {
  selected = '';
}

describe('OverlayMenuDirective', () => {
  let fixture: ComponentFixture<OverlayMenuTestHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayMenuTestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(OverlayMenuTestHost);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('passes template data, applies menu semantics, focuses, and closes on selection', async () => {
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    trigger.click();
    fixture.detectChanges();

    await vi.waitFor(() => expect(document.querySelector('.overlay-menu')).not.toBeNull());
    const menu = document.querySelector<HTMLElement>('.overlay-menu');
    const items = menu?.querySelectorAll<HTMLButtonElement>('.menu-item') ?? [];

    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('role')).toBe('menuitem');
    expect(items[0].textContent).toContain('Restore Archived Act');
    await vi.waitFor(() => expect(document.activeElement).toBe(items[0]));

    items[0].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selected).toBe('restore:Archived Act');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu?.classList.contains('is-closed')).toBe(true);
  });

  it('opens from the keyboard and navigates menu items with arrow keys', async () => {
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    await vi.waitFor(() => expect(document.querySelector('.overlay-menu')).not.toBeNull());
    const menu = document.querySelector<HTMLElement>('.overlay-menu');
    const items = menu?.querySelectorAll<HTMLButtonElement>('.menu-item') ?? [];
    await vi.waitFor(() => expect(document.activeElement).toBe(items[0]));

    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await vi.waitFor(() => expect(document.activeElement).toBe(items[1]));

    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu?.classList.contains('is-closed')).toBe(true);
  });
});
