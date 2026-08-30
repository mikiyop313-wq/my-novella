import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchComponent } from '../search.component';

describe('SearchComponent', () => {
  let fixture: ComponentFixture<SearchComponent>;
  let component: SearchComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SearchComponent] }).compileComponents();
    fixture = TestBed.createComponent(SearchComponent);
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

  it('renders configurable labels and emits option changes and close', () => {
    const scopeSelections: boolean[] = [];
    const matchCaseSelections: boolean[] = [];
    const wholeWordSelections: boolean[] = [];
    let closed = 0;
    component.scopeSelectedChange.subscribe(value => scopeSelections.push(value));
    component.matchCaseChange.subscribe(value => matchCaseSelections.push(value));
    component.wholeWordChange.subscribe(value => wholeWordSelections.push(value));
    component.closed.subscribe(() => closed++);
    fixture.componentRef.setInput('regionLabel', 'Find in document');
    fixture.componentRef.setInput('inputLabel', 'Search document text');
    fixture.componentRef.setInput('placeholder', 'Find text');
    fixture.componentRef.setInput('scopeLabel', 'All pages');
    fixture.detectChanges();

    const region = fixture.nativeElement.querySelector('[role="search"]') as HTMLElement;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(region.getAttribute('aria-label')).toBe('Find in document');
    expect(input.getAttribute('aria-label')).toBe('Search document text');
    expect(input.placeholder).toBe('Find text');

    (fixture.nativeElement.querySelector('.search-widget__scope-button') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[aria-label="Match case"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[aria-label="Match whole word"]') as HTMLButtonElement).click();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(scopeSelections).toEqual([true]);
    expect(matchCaseSelections).toEqual([true]);
    expect(wholeWordSelections).toEqual([true]);
    expect(closed).toBe(1);
  });

  it('hides the optional scope control when no label is provided', () => {
    expect(fixture.nativeElement.querySelector('.search-widget__scope-button')).toBeNull();
  });

  it('renders loading and match progress', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.search-widget__match-count').textContent).toContain('…');

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('currentMatch', 2);
    fixture.componentRef.setInput('totalMatches', 5);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.search-widget__match-count').textContent).toContain('2/5');
  });

  it('exposes retry when an error is present', () => {
    let retries = 0;
    component.retry.subscribe(() => retries++);
    fixture.componentRef.setInput('error', 'Search failed.');
    fixture.detectChanges();

    const retry = fixture.nativeElement.querySelector('.search-widget__error button') as HTMLButtonElement;
    retry.click();

    expect(retries).toBe(1);
  });
});
