import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexMatchChooserComponent } from './codex-match-chooser.component';

describe('CodexMatchChooserComponent', () => {
  let fixture: ComponentFixture<CodexMatchChooserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CodexMatchChooserComponent] }).compileComponents();
    fixture = TestBed.createComponent(CodexMatchChooserComponent);
    fixture.componentRef.setInput('entries', [
      { id: 'codex-2', name: 'Mara Vale' },
      { id: 'codex-1', name: 'Silver Key' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders entries in input order and focuses the first item', () => {
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Mara Vale',
      'Silver Key',
    ]);
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
