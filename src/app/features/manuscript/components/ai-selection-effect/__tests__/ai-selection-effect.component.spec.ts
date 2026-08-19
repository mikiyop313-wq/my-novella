import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceStore } from '../../../../workspace/workspace.store';
import {
  AiSelectionEditService,
  type AiSelectionEditSession,
} from '../../../helpers/ai/ai-selection-edit.service';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { AiSelectionEffectComponent } from '../ai-selection-effect.component';

describe('AiSelectionEffectComponent', () => {
  let fixture: ComponentFixture<AiSelectionEffectComponent>;
  let component: AiSelectionEffectComponent;
  let editor: Editor;
  let session: AiSelectionEditSession | null;
  let sessions: ReturnType<typeof signal<readonly AiSelectionEditSession[]>>;
  let startEdit: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  let confirm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    session = null;
    editor = new Editor({
      extensions: [StarterKit],
      content: '<p>Selected manuscript text</p>',
    });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 9)));
    const viewport = document.createElement('div');
    viewport.className = 'editor-content-wrapper';
    editor.view.dom.parentElement?.removeChild(editor.view.dom);
    viewport.appendChild(editor.view.dom);
    document.body.appendChild(viewport);

    sessions = signal<readonly AiSelectionEditSession[]>([]);
    startEdit = vi.fn(() => {
      session = createSession(editor);
      sessions.set([session]);
      return session.id;
    });
    cancel = vi.fn(async () => {
      session = null;
      sessions.set([]);
    });
    confirm = vi.fn(() => true);

    await TestBed.configureTestingModule({
      imports: [AiSelectionEffectComponent],
      providers: [
        { provide: ManuscriptStore, useValue: { editor: signal(editor) } },
        {
          provide: WorkspaceStore,
          useValue: { bookId: signal('book-1'), bookTitle: signal('Book One') },
        },
        {
          provide: AiSelectionEditService,
          useValue: {
            sessions,
            startEdit,
            cancel,
            confirm,
            toggleComparison: vi.fn(() => true),
            getSession: vi.fn(() => session),
            mapAttachedSelection: vi.fn(),
            isInternalUpdate: vi.fn(() => false),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiSelectionEffectComponent);
    component = fixture.componentInstance;
    vi.spyOn(component as any, 'updatePosition').mockReturnValue(true);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    editor.view.dom.closest('.editor-content-wrapper')?.remove();
    editor.destroy();
    TestBed.resetTestingModule();
  });

  it('delegates creation while retaining only the visual session ID', () => {
    expect(component.startEdit({
      category: 'rephrase',
      instruction: 'Rephrase the marked passage.',
      actionLabel: 'Rephrase',
    })).toBe(true);

    expect(startEdit).toHaveBeenCalledWith(expect.objectContaining({
      editor,
      bookId: 'book-1',
    }));
    expect(component.sessionId).toBe('selection-1');
    expect(component.state()).toBe('drawing');
  });

  it('renders review controls from service-owned ready state', () => {
    component.startEdit({
      category: 'rephrase',
      instruction: 'Rephrase the marked passage.',
      actionLabel: 'Rephrase',
    });
    session!.state.set('ready');
    session!.comparisonSegments.set([{ kind: 'added', text: 'replacement' }]);
    component.bounds.set({ top: 20, left: 30, width: 200, height: 60 });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.compare-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-button')).not.toBeNull();
    expect(component.frameHeight()).toBe(108);
  });

  it('delegates cancellation and emits dismissal', async () => {
    component.startEdit({
      category: 'expand',
      instruction: 'Expand the marked passage.',
      actionLabel: 'Expand',
    });
    const dismissed = vi.fn();
    component.dismissed.subscribe(dismissed);

    await component.cancel();

    expect(cancel).toHaveBeenCalledWith('selection-1');
    expect(dismissed).toHaveBeenCalledOnce();
    expect(component.state()).toBe('idle');
  });

  it('delegates confirmation without owning the replacement transaction', () => {
    component.startEdit({
      category: 'shorten',
      instruction: 'Shorten the marked passage.',
      actionLabel: 'Shorten',
    });
    component.confirm();
    expect(confirm).toHaveBeenCalledWith('selection-1');
  });
});

function createSession(editor: Editor): AiSelectionEditSession {
  return {
    id: 'selection-1',
    bookId: 'book-1',
    sceneId: 'scene-1',
    request: {
      category: 'rephrase',
      instruction: 'Rephrase the marked passage.',
      actionLabel: 'Rephrase',
    },
    activityLabel: 'Rephrasing prose',
    state: signal('drawing'),
    comparisonSegments: signal([]),
    isComparisonVisible: signal(false),
    generatedContent: signal(''),
    attachedEditor: editor,
    selection: { from: 1, to: 9 },
    previewSelection: null,
  };
}
