import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CodexDetectionModalComponent } from '../codex-detection-modal.component';

describe('CodexDetectionModalComponent', () => {
  let fixture: ComponentFixture<CodexDetectionModalComponent>;
  let component: CodexDetectionModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodexDetectionModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CodexDetectionModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the first mocked entry and its position', () => {
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

  it('removes an accepted entry and keeps the next entry in the current position', () => {
    button('.add-button').click();
    fixture.detectChanges();

    expect(component.entries()).toHaveLength(2);
    expect(component.currentIndex()).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('The Glass Harbor');
    expect(fixture.nativeElement.querySelector('.entry-count')?.textContent).toContain('1 / 2');
    expect(fixture.nativeElement.querySelector('.modal-body')?.classList).toContain('slide-next-b');

    button('.add-button').click();
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

  it('requests the modal to close after the final entry is resolved', () => {
    const close = vi.fn();
    component.close.subscribe(close);

    component.addToCodex();
    component.discard();
    component.addToCodex();

    expect(close).toHaveBeenCalledOnce();
  });

  function button(selector: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(selector) as HTMLButtonElement;
  }
});
