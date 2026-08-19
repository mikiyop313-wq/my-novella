import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlashCommandMenuComponent } from '../slash-command-menu.component';

describe('SlashCommandMenuComponent', () => {
  let fixture: ComponentFixture<SlashCommandMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SlashCommandMenuComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SlashCommandMenuComponent);
    fixture.componentRef.setInput('position', { left: 120, top: 80 });
    fixture.componentRef.setInput('selectedIndex', 0);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('renders the AI and structure sections with their descriptions', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('AI Prose Generation');
    expect(text).toContain('Generate or continue prose with AI.');
    expect(text).toContain('Create Structure');
    expect(text).toContain('Move the text below the current scene into a new chapter.');
    expect(text).toContain('Move the text below the current scene into a new act.');
    expect(text).toContain('Move the text below the current scene into a new scene.');

    const menu = fixture.nativeElement as HTMLElement;
    const titles = Array.from(
      menu.querySelectorAll<HTMLElement>('.command-title'),
      element => element.textContent?.trim(),
    );
    expect(titles).toEqual([
      'AI Prose Generation',
      'Create Act',
      'Create Chapter',
      'Create Scene',
    ]);
  });

  it('marks the keyboard-selected item and emits clicked commands', () => {
    fixture.componentRef.setInput('selectedIndex', 1);
    fixture.detectChanges();
    const selected = fixture.nativeElement.querySelector('.command-item.selected') as HTMLButtonElement;
    const commandSelected = vi.fn();
    fixture.componentInstance.commandSelected.subscribe(commandSelected);

    expect(selected.textContent).toContain('Create Act');
    selected.click();
    expect(commandSelected).toHaveBeenCalledWith('act');
  });

  it('dismisses when the user clicks outside the menu', () => {
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(dismissed).toHaveBeenCalledOnce();
  });
});
