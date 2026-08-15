import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CodexDetectionModalComponent } from '../codex-detection-modal.component';

const DETECTED_ENTRIES = [
  { name: 'Elara Voss', type: 'character' as const, description: 'A guarded cartographer.' },
  { name: 'The Glass Harbor', type: 'location' as const, description: 'A storm-battered port.' },
  { name: 'The Ashen Key', type: 'object' as const, description: 'An unusual iron key.' },
];

describe('CodexDetectionModalComponent', () => {
  let fixture: ComponentFixture<CodexDetectionModalComponent>;
  let component: CodexDetectionModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodexDetectionModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CodexDetectionModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('detectedEntries', DETECTED_ENTRIES);
    fixture.componentRef.setInput('saveEntry', vi.fn().mockResolvedValue({ success: true }));
    fixture.detectChanges();
  });

  it('renders the first detected entry and its position', () => {
    expect(fixture.nativeElement.textContent).toContain('Elara Voss');
    expect(fixture.nativeElement.textContent).toContain('Character');
    expect(fixture.nativeElement.querySelector('.entry-count')?.textContent).toContain('1 / 3');
  });

  it('navigates between entries and disables arrows at the boundaries', () => {
    const previousButton = button('.navigation-button[aria-label="Previous detected entry"]');
    const nextButton = button('.navigation-button[aria-label="Next detected entry"]');

    expect(previousButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(false);

    nextButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The Glass Harbor');
    expect(fixture.nativeElement.querySelector('.modal-body')?.classList).toContain('slide-next-b');
    expect(previousButton.disabled).toBe(false);

    nextButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The Ashen Key');
    expect(nextButton.disabled).toBe(true);

    previousButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal-body')?.classList).toContain('slide-previous-b');
  });

  it('removes an accepted entry and keeps the next entry in the current position', async () => {
    button('.add-button').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.entries()).toHaveLength(2);
    expect(component.currentIndex()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('The Glass Harbor');
    expect(fixture.nativeElement.querySelector('.entry-count')?.textContent).toContain('1 / 2');
    expect(fixture.nativeElement.querySelector('.modal-body')?.classList).toContain('slide-next-b');

    button('.add-button').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The Ashen Key');
    expect(fixture.nativeElement.querySelector('.modal-body')?.classList).toContain('slide-next-a');
  });

  it('removes a discarded entry and clamps the final position', () => {
    component.next();
    component.next();
    fixture.detectChanges();

    button('.discard-button').click();
    fixture.detectChanges();

    expect(component.entries()).toHaveLength(2);
    expect(component.currentIndex()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('The Glass Harbor');
    expect(fixture.nativeElement.querySelector('.entry-count')?.textContent).toContain('2 / 2');
    expect(fixture.nativeElement.querySelector('.modal-body')?.classList).toContain('slide-previous-b');
  });

  it('shows a save error and keeps the failed entry available for retry', async () => {
    const saveEntry = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'Entry name already exists.' })
      .mockResolvedValueOnce({ success: true });
    fixture.componentRef.setInput('saveEntry', saveEntry);
    fixture.detectChanges();

    await component.addToCodex();
    fixture.detectChanges();

    expect(component.entries()).toHaveLength(3);
    expect(component.currentEntry()?.name).toBe('Elara Voss');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Entry name already exists.',
    );

    const retry = component.addToCodex();
    expect(component.saveError()).toBeNull();
    await retry;

    expect(saveEntry).toHaveBeenCalledTimes(2);
    expect(component.entries()).toHaveLength(2);
  });

  it('clears a save error when navigating to another entry', async () => {
    fixture.componentRef.setInput(
      'saveEntry',
      vi.fn().mockResolvedValue({ success: false, error: 'Could not save the entry.' }),
    );
    fixture.detectChanges();

    await component.addToCodex();
    expect(component.saveError()).toBe('Could not save the entry.');

    component.next();

    expect(component.saveError()).toBeNull();
  });

  it('requests the modal to close after the final entry is resolved', async () => {
    const close = vi.fn();
    component.close.subscribe(close);

    await component.addToCodex();
    component.discard();
    await component.addToCodex();

    expect(close).toHaveBeenCalledOnce();
  });

  function button(selector: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(selector) as HTMLButtonElement;
  }
});
