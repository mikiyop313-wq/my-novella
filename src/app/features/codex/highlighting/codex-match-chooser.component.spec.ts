import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexMatchChooserComponent } from './codex-match-chooser.component';

describe('CodexMatchChooserComponent', () => {
  let fixture: ComponentFixture<CodexMatchChooserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CodexMatchChooserComponent] }).compileComponents();
    fixture = TestBed.createComponent(CodexMatchChooserComponent);
    fixture.componentRef.setInput('entries', [
      {
        id: 'codex-2',
        type: 'character',
        name: 'Mara Vale',
        description: 'A cautious cartographer.',
      },
      { id: 'codex-1', type: 'object', name: 'Silver Key', description: null },
      { id: 'codex-3', type: 'location', name: 'North Reach', description: null },
      { id: 'codex-4', type: 'lore', name: 'The Sundering', description: null },
      { id: 'codex-5', type: 'subplot', name: 'Missing Heir', description: null },
      { id: 'codex-6', type: 'other', name: 'Unsorted Note', description: null },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders entry previews in input order and focuses the first item', () => {
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];

    expect(buttons[0].querySelector('.entry-title')?.textContent).toContain('Mara Vale');
    expect(buttons[0].querySelector('.entry-description')?.textContent).toContain(
      'A cautious cartographer.',
    );
    expect(buttons[1].querySelector('.entry-title')?.textContent).toContain('Silver Key');
    expect(buttons[1].querySelector('.entry-description')?.textContent).toContain(
      'No description available.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Open entry');
    expect(
      buttons.map((button) => button.querySelector('.entry-type')?.textContent?.trim()),
    ).toEqual(['Character', 'Object', 'Location', 'Lore', 'Subplot', 'Other']);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('emits the selected entry ID', () => {
    const selected = vi.fn();
    fixture.componentInstance.entrySelected.subscribe(selected);

    (fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement).click();

    expect(selected).toHaveBeenCalledWith('codex-1');
  });

  it('requests close and consumes Escape', () => {
    const closeRequested = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closeRequested);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

    fixture.nativeElement.dispatchEvent(event);

    expect(closeRequested).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
