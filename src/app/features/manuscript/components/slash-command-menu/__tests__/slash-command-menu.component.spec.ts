import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  positionSlashCommandMenu,
  SlashCommandMenuComponent,
} from '../slash-command-menu.component';

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

  it('hides the structure section when only AI is available', () => {
    fixture.componentRef.setInput('items', [{
      command: 'ai',
      title: 'AI Prose Generation',
      description: 'Generate or continue prose with AI.',
    }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#slash-command-ai')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#structure-command-heading')).toBeNull();
    expect(fixture.nativeElement.querySelector('.section-divider')).toBeNull();
  });
});

describe('positionSlashCommandMenu', () => {
  const viewport = { width: 1024, height: 800 };
  const menu = { width: 370, height: 240 };

  it('places the menu below the editing line when it fits', () => {
    expect(positionSlashCommandMenu({
      anchor: { left: 100, top: 40, bottom: 60 },
      menu,
      viewport,
    })).toEqual({ left: 100, top: 68, maxHeight: 720, placement: 'below' });
  });

  it('places the menu above the editing line when it does not fit below', () => {
    expect(positionSlashCommandMenu({
      anchor: { left: 100, top: 700, bottom: 720 },
      menu,
      viewport,
    })).toEqual({ left: 100, top: 692, maxHeight: 680, placement: 'above' });
  });

  it('uses the rendered menu height when choosing a side', () => {
    const anchor = { left: 100, top: 600, bottom: 620 };

    expect(positionSlashCommandMenu({
      anchor,
      menu: { width: 370, height: 160 },
      viewport,
    }).placement).toBe('below');
    expect(positionSlashCommandMenu({
      anchor,
      menu: { width: 370, height: 161 },
      viewport,
    }).placement).toBe('above');
  });

  it('constrains the menu horizontally and limits its height on the larger side', () => {
    expect(positionSlashCommandMenu({
      anchor: { left: 1000, top: 450, bottom: 470 },
      menu: { width: 370, height: 500 },
      viewport,
    })).toEqual({ left: 642, top: 442, maxHeight: 430, placement: 'above' });
  });

  it('allows the menu to follow an off-screen editing line', () => {
    expect(positionSlashCommandMenu({
      anchor: { left: 100, top: -100, bottom: -80 },
      menu,
      viewport,
    })).toEqual({ left: 100, top: -72, maxHeight: 776, placement: 'below' });
  });
});
