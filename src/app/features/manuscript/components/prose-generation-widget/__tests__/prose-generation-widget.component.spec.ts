import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import type {
  AiGenerationSession,
  AiGenerationSessionSource,
  AiGenerationSessionStatus,
} from '../../../../../core/services/ai-generation-session.service';
import { AiGenerationSessionService } from '../../../../../core/services/ai-generation-session.service';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { WorkspaceStore } from '../../../../workspace/workspace.store';
import {
  AiSelectionEditService,
  type AiSelectionEditSession,
  type AiSelectionEditState,
} from '../../../helpers/ai/ai-selection-edit.service';
import { ProseGenerationWidgetComponent } from '../prose-generation-widget.component';

describe('ProseGenerationWidgetComponent', () => {
  let fixture: ComponentFixture<ProseGenerationWidgetComponent>;
  let component: ProseGenerationWidgetComponent;
  let sessions: ReturnType<typeof signal<AiGenerationSession[]>>;
  let selectionSessions: ReturnType<typeof signal<AiSelectionEditSession[]>>;
  let stop: ReturnType<typeof vi.fn>;
  let cancelSelection: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sessions = signal<AiGenerationSession[]>([]);
    selectionSessions = signal<AiSelectionEditSession[]>([]);
    stop = vi.fn().mockResolvedValue(undefined);
    cancelSelection = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [ProseGenerationWidgetComponent],
      providers: [
        {
          provide: AiGenerationSessionService,
          useValue: {
            sessions: () => sessions(),
            stop,
          },
        },
        {
          provide: AiSelectionEditService,
          useValue: {
            sessions: selectionSessions,
            sessionsForBook: () => selectionSessions(),
            cancel: cancelSelection,
          },
        },
        {
          provide: WorkspaceStore,
          useValue: { bookId: signal('book-1') },
        },
        {
          provide: ManuscriptStore,
          useValue: {
            bookHierarchy: signal([{
              id: 'act-1',
              bookId: 'book-1',
              title: 'Beginnings',
              position: 0,
              status: 'active',
              summary: null,
              chapters: [{
                id: 'chapter-1',
                actId: 'act-1',
                title: 'Arrival',
                position: 0,
                status: 'active',
                summary: null,
                scenes: [
                  scene('scene-1', 'The Gate', 0),
                  scene('scene-2', 'The Hall', 1),
                ],
              }],
            }]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProseGenerationWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows only active manuscript sessions with their activity, location, and word count', () => {
    sessions.set([
      generation('chat-1', 'scene-1', 'Chat text', 'chat-response'),
      generation('prose-1', 'scene-1', 'One two three'),
    ]);
    fixture.detectChanges();

    const widget = fixture.nativeElement.querySelector('.prose-generation-widget') as HTMLElement;
    expect(widget).not.toBeNull();
    expect(widget.textContent).toContain('Generating prose');
    expect(widget.textContent).toContain('Act 1: Beginnings › Chapter 1: Arrival › Scene 1: The Gate');
    expect(widget.textContent).toContain('3');
    expect(widget.textContent).toContain('words');
    expect(fixture.nativeElement.querySelector('.generation-navigation')).toBeNull();
  });

  it('hides prose sessions from another book even when the scene id matches', () => {
    sessions.set([{
      ...generation('other-book-prose', 'scene-1', 'Hidden prose'),
      bookId: 'book-2',
    }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.prose-generation-widget')).toBeNull();
  });

  it.each([
    ['Rephrasing prose', 'rephrase-1'],
    ['Expanding prose', 'expand-1'],
    ['Shortening prose', 'shorten-1'],
    ['Editing prose', 'other-1'],
  ])('shows the selection activity label %s', (activityLabel, id) => {
    selectionSessions.set([selectionEdit(id, 'scene-1', activityLabel)]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(activityLabel);
  });

  it('selects the newest stream and moves through multiple active generations', () => {
    const first = generation('prose-1', 'scene-1', 'First');
    sessions.set([first]);
    fixture.detectChanges();

    sessions.set([first]);
    selectionSessions.set([selectionEdit('selection-2', 'scene-2', 'Expanding prose')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Scene 2: The Hall');
    expect(fixture.nativeElement.textContent).toContain('Expanding prose');
    expect(fixture.nativeElement.querySelector('.generation-navigation')?.textContent).toContain('2 / 2');

    const previous = fixture.nativeElement.querySelector(
      'button[aria-label="Previous AI activity"]',
    ) as HTMLButtonElement;
    previous.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Scene 1: The Gate');
    expect(fixture.nativeElement.querySelector('.generation-navigation')?.textContent).toContain('1 / 2');
  });

  it('stops only the selected stream and keeps controls from requesting focus', async () => {
    sessions.set([
      generation('prose-1', 'scene-1', 'First'),
      generation('prose-2', 'scene-2', 'Second'),
    ]);
    fixture.detectChanges();
    const focusRequested = vi.fn();
    component.focusRequested.subscribe(focusRequested);

    const stopButton = fixture.nativeElement.querySelector(
      'button[aria-label="Stop generating prose"]',
    ) as HTMLButtonElement;
    stopButton.click();
    await fixture.whenStable();

    expect(stop).toHaveBeenCalledWith('prose-2');
    expect(focusRequested).not.toHaveBeenCalled();
  });

  it('retains successful prose after its generation session is released', () => {
    const completed = generation('prose-1', 'scene-1', 'Finished prose');
    const focusRequested = vi.fn();
    component.focusRequested.subscribe(focusRequested);
    sessions.set([completed]);
    fixture.detectChanges();

    completed.status.set('complete');
    fixture.detectChanges();
    sessions.set([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('2');
    expect(fixture.nativeElement.querySelector('.generation-stop-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.generation-complete-button')).not.toBeNull();

    (fixture.nativeElement.querySelector('.prose-generation-widget') as HTMLElement).click();
    expect(focusRequested).toHaveBeenCalledWith({
      target: 'prose-block',
      blockId: 'prose-1',
      sceneId: 'scene-1',
    });
  });

  it('dismisses only the selected completed prose without stopping another entry', () => {
    sessions.set([
      generation('prose-1', 'scene-1', 'First', 'manuscript-prose', 'complete'),
      generation('prose-2', 'scene-2', 'Second', 'manuscript-prose', 'complete'),
    ]);
    fixture.detectChanges();

    const dismissButton = fixture.nativeElement.querySelector(
      '.generation-complete-button',
    ) as HTMLButtonElement;
    dismissButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Scene 1: The Gate');
    expect(fixture.nativeElement.textContent).not.toContain('Scene 2: The Hall');
    expect(fixture.nativeElement.querySelector('.generation-navigation')).toBeNull();
    expect(stop).not.toHaveBeenCalled();
    expect(cancelSelection).not.toHaveBeenCalled();
  });

  it('hides after dismissing the final completed prose entry', () => {
    sessions.set([
      generation('prose-1', 'scene-1', 'Finished', 'manuscript-prose', 'complete'),
    ]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.generation-complete-button') as HTMLButtonElement)
      .click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.prose-generation-widget')).toBeNull();
    expect(stop).not.toHaveBeenCalled();
  });

  it('dismisses a ready selection widget without cancelling its pending edit', () => {
    const readyEdit = selectionEdit('selection-1', 'scene-1', 'Rephrasing prose', 'ready');
    selectionSessions.set([readyEdit]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Review rephrase');
    (fixture.nativeElement.querySelector('.generation-complete-button') as HTMLButtonElement)
      .click();
    fixture.detectChanges();

    expect(selectionSessions()).toContain(readyEdit);
    expect(cancelSelection).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.prose-generation-widget')).toBeNull();
  });

  it('removes stopped and failed prose without waiting for dismissal', () => {
    const stopped = generation('prose-1', 'scene-1', 'Partial');
    const failed = generation('prose-2', 'scene-2', '');
    sessions.set([stopped, failed]);
    fixture.detectChanges();

    stopped.status.set('stopped');
    failed.status.set('failed');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.prose-generation-widget')).toBeNull();
  });

  it('shows a new generation cycle for a previously dismissed block id', () => {
    sessions.set([
      generation('prose-1', 'scene-1', 'Finished', 'manuscript-prose', 'complete'),
    ]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.generation-complete-button') as HTMLButtonElement)
      .click();
    fixture.detectChanges();

    sessions.set([]);
    fixture.detectChanges();
    sessions.set([generation('prose-1', 'scene-1', 'Regenerating')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.generation-stop-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.generation-complete-button')).toBeNull();
  });

  it('requests the selected block position and hides when no prose streams remain', () => {
    sessions.set([generation('prose-1', 'scene-1', 'First')]);
    fixture.detectChanges();
    const focusRequested = vi.fn();
    component.focusRequested.subscribe(focusRequested);

    (fixture.nativeElement.querySelector('.prose-generation-widget') as HTMLElement).click();
    expect(focusRequested).toHaveBeenCalledWith({
      target: 'prose-block',
      blockId: 'prose-1',
      sceneId: 'scene-1',
    });

    sessions.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.prose-generation-widget')).toBeNull();
  });

  it('requests the exact selection edit session', () => {
    selectionSessions.set([selectionEdit('selection-1', 'scene-1', 'Rephrasing prose')]);
    fixture.detectChanges();
    const focusRequested = vi.fn();
    component.focusRequested.subscribe(focusRequested);

    (fixture.nativeElement.querySelector('.prose-generation-widget') as HTMLElement).click();

    expect(focusRequested).toHaveBeenCalledWith({
      target: 'selection-edit',
      sessionId: 'selection-1',
      sceneId: 'scene-1',
    });
  });
});

function scene(id: string, title: string, position: number) {
  return {
    id,
    chapterId: 'chapter-1',
    title,
    position,
    status: 'active' as const,
    prose: null,
    summary: null,
    wordCount: 0,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}

function selectionEdit(
  id: string,
  sceneId: string,
  activityLabel: string,
  state: AiSelectionEditState = 'generating',
): AiSelectionEditSession {
  return {
    id,
    bookId: 'book-1',
    sceneId,
    request: {
      category: activityLabel.startsWith('Expanding') ? 'expand' : 'rephrase',
      instruction: 'Edit the passage.',
      actionLabel: activityLabel.startsWith('Expanding') ? 'Expand' : 'Rephrase',
    },
    activityLabel,
    state: signal(state),
    comparisonSegments: signal([]),
    isComparisonVisible: signal(false),
    generatedContent: signal('Edited response'),
    attachedEditor: null,
    selection: null,
    previewSelection: null,
  };
}

function generation(
  id: string,
  scopeId: string,
  content: string,
  source: AiGenerationSessionSource = 'manuscript-prose',
  status: AiGenerationSessionStatus = 'generating',
  activityLabel?: string,
): AiGenerationSession & { status: WritableSignal<AiGenerationSessionStatus> } {
  return {
    id,
    bookId: 'book-1',
    source,
    scopeId,
    activityLabel,
    status: signal(status),
    content: signal(content),
    reasoning: signal(''),
    error: signal(null),
    completion: Promise.resolve({ status: 'complete', content, reasoning: '', error: null }),
  };
}
