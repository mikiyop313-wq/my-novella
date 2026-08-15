import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { MarkdownEditorComponent } from '../../../../../shared/components/markdown-editor/markdown-editor.component';
import { AiGenerationSessionService } from '../../../../../core/services/ai-generation-session.service';
import { ElectronService } from '../../../../../core/services/electron.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { SceneSummaryComponent } from './scene-summary.component';

describe('SceneSummaryComponent', () => {
  let component: SceneSummaryComponent;
  let fixture: ComponentFixture<SceneSummaryComponent>;
  let updateAttributes: ReturnType<typeof vi.fn>;

  const store = {
    showSceneTitles: vi.fn(() => true),
    showSummaries: vi.fn(() => true),
    editor: vi.fn(() => null),
    bookHierarchy: vi.fn(() => [{
      bookId: 'book-1',
      chapters: [{ scenes: [{ id: 'scene-1', wordCount: 2 }] }],
    }]),
    bookId: vi.fn(() => 'book-1'),
    updateScene: vi.fn(),
    archiveScene: vi.fn(),
    deleteScene: vi.fn(),
  };
  const electronService = { invoke: vi.fn() };
  const generationSessions = { start: vi.fn(), release: vi.fn() };
  const toastService = { error: vi.fn() };

  beforeEach(async () => {
    vi.useFakeTimers();
    store.bookHierarchy.mockReturnValue([{
      bookId: 'book-1',
      chapters: [{ scenes: [{ id: 'scene-1', wordCount: 2 }] }],
    }]);
    store.updateScene.mockReset();
    store.archiveScene.mockReset();
    store.deleteScene.mockReset();
    electronService.invoke.mockReset();
    generationSessions.start.mockReset();
    generationSessions.release.mockReset();
    toastService.error.mockReset();
    updateAttributes = vi.fn();

    await TestBed.configureTestingModule({
      imports: [SceneSummaryComponent],
      providers: [
        { provide: ManuscriptStore, useValue: store },
        { provide: ElectronService, useValue: electronService },
        { provide: AiGenerationSessionService, useValue: generationSessions },
        { provide: ToastService, useValue: toastService },
      ],
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

  it('generates an AI summary from the scene prose and replaces the current summary', async () => {
    electronService.invoke.mockResolvedValue({
      'scene-1': {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Scene prose.' }] }],
      },
    });
    generationSessions.start.mockReturnValue({
      completion: Promise.resolve({
        status: 'complete',
        content: ' Generated summary. ',
        reasoning: '',
        error: null,
      }),
    });

    await component.generateAiSummary();

    expect(component.summary()).toBe('Generated summary.');
    expect(updateAttributes).toHaveBeenCalledWith({ summary: 'Generated summary.' });
    expect(store.updateScene).toHaveBeenCalledWith({
      id: 'scene-1',
      summary: 'Generated summary.',
    });
    expect(generationSessions.release).toHaveBeenCalledWith('manuscript-scene-summary:scene-1');
  });

  it('archives or deletes the current scene through the manuscript store', async () => {
    store.archiveScene.mockResolvedValue(undefined);

    await component.archiveScene();
    component.deleteScene();

    expect(store.archiveScene).toHaveBeenCalledWith('scene-1');
    expect(store.deleteScene).toHaveBeenCalledWith('scene-1');
  });

  it('disables AI summary generation when the scene has no prose', async () => {
    store.bookHierarchy.mockReturnValue([{
      bookId: 'book-1',
      chapters: [{ scenes: [{ id: 'scene-1', wordCount: 0 }] }],
    }]);

    expect(component.isAiSummaryDisabled()).toBe(true);

    await component.generateAiSummary();

    expect(electronService.invoke).not.toHaveBeenCalled();
    expect(generationSessions.start).not.toHaveBeenCalled();
  });
});
