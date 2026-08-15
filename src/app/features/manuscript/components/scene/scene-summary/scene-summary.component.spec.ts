import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { MarkdownEditorComponent } from '../../../../../shared/components/markdown-editor/markdown-editor.component';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { SceneSummaryComponent } from './scene-summary.component';

describe('SceneSummaryComponent', () => {
  let component: SceneSummaryComponent;
  let fixture: ComponentFixture<SceneSummaryComponent>;
  let updateAttributes: ReturnType<typeof vi.fn>;

  const store = {
    showSceneTitles: vi.fn(() => true),
    showSummaries: vi.fn(() => true),
    updateScene: vi.fn(),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    store.updateScene.mockReset();
    updateAttributes = vi.fn();

    await TestBed.configureTestingModule({
      imports: [SceneSummaryComponent],
      providers: [{ provide: ManuscriptStore, useValue: store }],
    }).compileComponents();

    fixture = TestBed.createComponent(SceneSummaryComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('node', {
      attrs: {
        id: 'scene-1',
        title: 'Scene 1',
        summary: '**Opening** summary',
      },
    });
    fixture.componentRef.setInput('updateAttributes', updateAttributes);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('renders the existing summary in the markdown editor', () => {
    const editorDebugElement = fixture.debugElement.query(By.directive(MarkdownEditorComponent));
    const editor = editorDebugElement.componentInstance as MarkdownEditorComponent;

    expect(editor.value()).toBe('**Opening** summary');
    expect(editor.placeholder()).toBe('Add a summary...');
    expect(editor.ariaLabel()).toBe('Scene summary');
    expect(fixture.nativeElement.querySelector('.summary-editable-content')).toBeNull();
    expect(fixture.nativeElement.querySelector('.scene-title-editable[contenteditable="true"]')).not.toBeNull();
  });

  it('updates node attributes immediately and persists markdown after the debounce', () => {
    const editor = fixture.debugElement.query(By.directive(MarkdownEditorComponent))
      .componentInstance as MarkdownEditorComponent;

    editor.valueChange.emit('New **markdown** summary');

    expect(component.summary()).toBe('New **markdown** summary');
    expect(updateAttributes).toHaveBeenCalledWith({ summary: 'New **markdown** summary' });
    expect(store.updateScene).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(store.updateScene).toHaveBeenCalledWith({
      id: 'scene-1',
      summary: 'New **markdown** summary',
    });
  });

  it('normalizes whitespace-only markdown to an empty summary', () => {
    const editor = fixture.debugElement.query(By.directive(MarkdownEditorComponent))
      .componentInstance as MarkdownEditorComponent;

    editor.valueChange.emit('  \n  ');
    vi.advanceTimersByTime(500);

    expect(component.summary()).toBe('');
    expect(updateAttributes).toHaveBeenCalledWith({ summary: '' });
    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', summary: '' });
  });
});
