import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import type {
  AiGenerationSession,
  AiGenerationSessionSource,
  AiGenerationSessionStatus,
} from '../../../../../core/services/ai-generation-session.service';
import { AiGenerationSessionService } from '../../../../../core/services/ai-generation-session.service';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { ProseGenerationWidgetComponent } from '../prose-generation-widget.component';

describe('ProseGenerationWidgetComponent', () => {
  let fixture: ComponentFixture<ProseGenerationWidgetComponent>;
  let component: ProseGenerationWidgetComponent;
  let sessions: ReturnType<typeof signal<AiGenerationSession[]>>;
  let stop: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sessions = signal<AiGenerationSession[]>([]);
    stop = vi.fn().mockResolvedValue(undefined);

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

  it('shows only active prose sessions with their location and generated word count', () => {
    sessions.set([
      generation('chat-1', 'scene-1', 'Chat text', 'chat-response'),
      generation('complete-1', 'scene-1', 'Finished prose', 'manuscript-prose', 'complete'),
      generation('prose-1', 'scene-1', 'One two three'),
    ]);
    fixture.detectChanges();

    const widget = fixture.nativeElement.querySelector('.prose-generation-widget') as HTMLElement;
    expect(widget).not.toBeNull();
    expect(widget.textContent).toContain('Act 1: Beginnings › Chapter 1: Arrival › Scene 1: The Gate');
    expect(widget.textContent).toContain('3');
    expect(widget.textContent).toContain('words');
    expect(fixture.nativeElement.querySelector('.generation-navigation')).toBeNull();
  });

  it('selects the newest stream and moves through multiple active generations', () => {
    const first = generation('prose-1', 'scene-1', 'First');
    sessions.set([first]);
    fixture.detectChanges();

    sessions.set([first, generation('prose-2', 'scene-2', 'Second response')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Scene 2: The Hall');
    expect(fixture.nativeElement.querySelector('.generation-navigation')?.textContent).toContain('2 / 2');

    const previous = fixture.nativeElement.querySelector(
      'button[aria-label="Previous prose generation"]',
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
      'button[aria-label="Stop this prose generation"]',
    ) as HTMLButtonElement;
    stopButton.click();
    await fixture.whenStable();

    expect(stop).toHaveBeenCalledWith('prose-2');
    expect(focusRequested).not.toHaveBeenCalled();
  });

  it('requests the selected block position and hides when no prose streams remain', () => {
    sessions.set([generation('prose-1', 'scene-1', 'First')]);
    fixture.detectChanges();
    const focusRequested = vi.fn();
    component.focusRequested.subscribe(focusRequested);

    (fixture.nativeElement.querySelector('.prose-generation-widget') as HTMLElement).click();
    expect(focusRequested).toHaveBeenCalledWith({ blockId: 'prose-1', sceneId: 'scene-1' });

    sessions.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.prose-generation-widget')).toBeNull();
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

function generation(
  id: string,
  scopeId: string,
  content: string,
  source: AiGenerationSessionSource = 'manuscript-prose',
  status: AiGenerationSessionStatus = 'generating',
): AiGenerationSession {
  return {
    id,
    source,
    scopeId,
    status: signal(status),
    content: signal(content),
    reasoning: signal(''),
    error: signal(null),
    completion: Promise.resolve({ status: 'complete', content, reasoning: '', error: null }),
  };
}
