import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManuscriptSearchComponent } from '../manuscript-search.component';

describe('ManuscriptSearchComponent', () => {
  let fixture: ComponentFixture<ManuscriptSearchComponent>;
  let component: ManuscriptSearchComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ManuscriptSearchComponent] }).compileComponents();
    fixture = TestBed.createComponent(ManuscriptSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('emits query and keyboard navigation actions', () => {
    const queries: string[] = [];
    let previous = 0;
    let next = 0;
    component.queryChange.subscribe(value => queries.push(value));
    component.previous.subscribe(() => previous++);
    component.next.subscribe(() => next++);
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = 'sea';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));

    expect(queries).toEqual(['sea']);
    expect(next).toBe(1);
    expect(previous).toBe(1);
  });

  it('emits option changes and close', () => {
    const scopes: boolean[] = [];
    let closed = 0;
    component.wholeManuscriptChange.subscribe(value => scopes.push(value));
    component.closed.subscribe(() => closed++);

    const buttons = fixture.nativeElement.querySelectorAll('button');
    (buttons[3] as HTMLButtonElement).click();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(scopes).toEqual([true]);
    expect(closed).toBe(1);
  });

  it('renders match progress and exposes retry for whole-search errors', () => {
    let retries = 0;
    component.retry.subscribe(() => retries++);
    fixture.componentRef.setInput('currentMatch', 2);
    fixture.componentRef.setInput('totalMatches', 5);
    fixture.componentRef.setInput('error', 'Could not search the whole manuscript.');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.match-count').textContent).toContain('2/5');
    const retry = fixture.nativeElement.querySelector('.search-error button') as HTMLButtonElement;
    retry.click();
    expect(retries).toBe(1);
  });
});
