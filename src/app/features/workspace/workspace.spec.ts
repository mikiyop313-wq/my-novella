import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ChildrenOutletContexts, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NEVER, of } from 'rxjs';

import type { ChatThreadDetailDto } from '../../../../shared/models/chat.model';
import { ChatStore } from '../chat/store/chat.store';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { CodexDetectionStateService } from '../codex/services/codex-detection-state.service';
import { CodexService } from '../codex/services/codex.service';
import { CodexStore } from '../codex/store/codex.store';
import { ToastService } from '../../shared/services/toast.service';
import { Workspace } from './workspace';
import { WorkspaceBookStore } from './workspace-book.store';
import { WorkspaceStore } from './workspace.store';

function makeThread(overrides: Partial<ChatThreadDetailDto> = {}): ChatThreadDetailDto {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'Draft chat',
    status: 'active',
    lastModelId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    branchSelections: [],
    ...overrides,
  };
}

describe('Workspace', () => {
  let fixture: ComponentFixture<Workspace>;
  let component: Workspace;
  let currentBookId: string | null;
  let selectedThread: ChatThreadDetailDto | null;
  let lastManuscriptRoutes: Record<string, { mode: 'book' | 'act' | 'chapter' | 'scene'; id: string }>;
  let routerUrl: string;
  let codexDetectionState: CodexDetectionStateService;
  let codexService: {
    createEntry: ReturnType<typeof vi.fn>;
    getEntries: ReturnType<typeof vi.fn>;
  };
  let codexStore: {
    activeType: ReturnType<typeof vi.fn>;
    searchQuery: ReturnType<typeof vi.fn>;
    entryFilters: ReturnType<typeof vi.fn>;
    loadEntries: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    currentBookId = null;
    selectedThread = null;
    lastManuscriptRoutes = {};
    routerUrl = '/workspace/book-1/outline';
    codexService = {
      createEntry: vi.fn().mockResolvedValue(undefined),
      getEntries: vi.fn().mockResolvedValue([]),
    };
    codexStore = {
      activeType: vi.fn(() => 'character'),
      searchQuery: vi.fn(() => ''),
      entryFilters: vi.fn(() => ({})),
      loadEntries: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Workspace],
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            activeView: vi.fn(() => 'outline'),
            bookId: vi.fn(() => 'book-1'),
            enterBook: vi.fn(),
            setActiveView: vi.fn(),
            setLastWorkspaceUrl: vi.fn(),
            rememberManuscriptRoute: vi.fn((bookId, route) => {
              lastManuscriptRoutes[bookId] = route;
            }),
            getLastManuscriptRoute: vi.fn((bookId: string) => lastManuscriptRoutes[bookId] ?? null),
          },
        },
        {
          provide: WorkspaceBookStore,
          useValue: {
            clearBookHierarchy: vi.fn(),
            loadBookHierarchy: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ChatStore,
          useValue: {
            bookId: vi.fn(() => currentBookId),
            selectedThread: vi.fn(() => selectedThread),
          },
        },
        {
          provide: CodexContextTrieService,
          useValue: { loadForContext: vi.fn(), refreshCurrentContext: vi.fn() },
        },
        { provide: CodexService, useValue: codexService },
        { provide: CodexStore, useValue: codexStore },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ bookId: 'book-1' })) },
        },
        {
          provide: Router,
          useValue: {
            events: NEVER,
            navigate: vi.fn(),
            get url() { return routerUrl; },
          },
        },
        { provide: ChildrenOutletContexts, useValue: { getContext: vi.fn() } },
      ],
    })
      .overrideComponent(Workspace, {
        set: {
          template: `
            <ng-container [appOverlayModal]="codexDetectionModal"
              #codexDetectionModalTrigger="appOverlayModal"
              (closed)="onCodexDetectionModalClosed()"></ng-container>
            <ng-template #codexDetectionModal let-closeModal>
              <app-codex-detection-modal [detectedEntries]="detectedCodexEntries()"
                [saveEntry]="saveDetectedCodexEntry"
                (close)="closeModal()">
              </app-codex-detection-modal>
            </ng-template>
          `,
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(Workspace);
    component = fixture.componentInstance;
    codexDetectionState = TestBed.inject(CodexDetectionStateService);
  });

  it('loads Codex context trie when entering the workspace book', () => {
    const codexContextTrie = TestBed.inject(CodexContextTrieService);

    fixture.detectChanges();

    expect(codexContextTrie.loadForContext).toHaveBeenCalledWith('book-1');
  });

  it('loads the shared hierarchy when entering the workspace book', () => {
    const bookStore = TestBed.inject(WorkspaceBookStore);

    fixture.detectChanges();

    expect(bookStore.clearBookHierarchy).toHaveBeenCalledOnce();
    expect(bookStore.loadBookHierarchy).toHaveBeenCalledWith('book', 'book-1');
  });

  it('sets settings as the active view for the settings route', () => {
    const workspaceStore = TestBed.inject(WorkspaceStore);
    routerUrl = '/workspace/book-1/settings';

    fixture.detectChanges();

    expect(workspaceStore.setActiveView).toHaveBeenCalledWith('settings');
    expect(workspaceStore.setLastWorkspaceUrl).not.toHaveBeenCalled();
  });

  it('remembers the latest non-settings workspace route', () => {
    const workspaceStore = TestBed.inject(WorkspaceStore);
    routerUrl = '/workspace/book-1/thread/thread-1';

    fixture.detectChanges();

    expect(workspaceStore.setActiveView).toHaveBeenCalledWith('chat');
    expect(workspaceStore.setLastWorkspaceUrl).toHaveBeenCalledWith(
      '/workspace/book-1/thread/thread-1',
    );
  });

  it('returns the selected thread route for the active book', () => {
    currentBookId = 'book-1';
    selectedThread = makeThread();

    expect(component.getChatRoute('book-1')).toEqual([
      '/workspace',
      'book-1',
      'thread',
      'thread-1',
    ]);
  });

  it('returns the thread list route when no thread is selected', () => {
    currentBookId = 'book-1';

    expect(component.getChatRoute('book-1')).toEqual(['/workspace', 'book-1', 'threads']);
  });

  it('returns the thread list route when the selected thread belongs to another book', () => {
    currentBookId = 'book-2';
    selectedThread = makeThread({ bookId: 'book-2' });

    expect(component.getChatRoute('book-1')).toEqual(['/workspace', 'book-1', 'threads']);
  });

  it('returns the full manuscript route when the book has no remembered scope', () => {
    expect(component.getManuscriptRoute('book-1')).toEqual([
      '/workspace',
      'book-1',
      'manuscript',
      'book',
      'book-1',
    ]);
  });

  it('returns the remembered manuscript scope for the selected book', () => {
    lastManuscriptRoutes['book-1'] = { mode: 'chapter', id: 'chapter-3' };

    expect(component.getManuscriptRoute('book-1')).toEqual([
      '/workspace',
      'book-1',
      'manuscript',
      'chapter',
      'chapter-3',
    ]);
  });

  it('remembers the active manuscript route when the workspace opens', () => {
    routerUrl = '/workspace/book-1/manuscript/chapter/chapter-3';

    fixture.detectChanges();

    expect(lastManuscriptRoutes['book-1']).toEqual({ mode: 'chapter', id: 'chapter-3' });
  });

  it('keeps remembered manuscript scopes isolated by book', () => {
    lastManuscriptRoutes['book-1'] = { mode: 'scene', id: 'scene-1' };
    lastManuscriptRoutes['book-2'] = { mode: 'act', id: 'act-2' };

    expect(component.getManuscriptRoute('book-1')).toEqual([
      '/workspace',
      'book-1',
      'manuscript',
      'scene',
      'scene-1',
    ]);
    expect(component.getManuscriptRoute('book-2')).toEqual([
      '/workspace',
      'book-2',
      'manuscript',
      'act',
      'act-2',
    ]);
  });

  it('accepts a detected Codex entry from the workspace lifetime', async () => {
    const entry = {
      name: 'The Glass Harbor',
      type: 'location' as const,
      description: 'A storm-battered port.',
    };
    codexDetectionState.enqueue({ bookId: 'book-1', sceneId: 'scene-1', entries: [entry] });

    await expect(component.saveDetectedCodexEntry(entry)).resolves.toEqual({ success: true });

    expect(codexService.createEntry).toHaveBeenCalledWith({
      bookId: 'book-1',
      ...entry,
      trackingSetting: 'include_when_detected',
    });
    expect(codexStore.loadEntries).toHaveBeenCalledWith('book-1', 'character', '', {});
    expect(TestBed.inject(CodexContextTrieService).refreshCurrentContext).toHaveBeenCalled();
  });

  it('returns a detected Codex entry save error', async () => {
    const error = new Error('Entry name already exists.');
    codexService.createEntry.mockRejectedValueOnce(error);
    const entry = {
      name: 'The Glass Harbor',
      type: 'location' as const,
      description: 'A storm-battered port.',
    };
    codexDetectionState.enqueue({ bookId: 'book-1', sceneId: 'scene-1', entries: [entry] });

    await expect(component.saveDetectedCodexEntry(entry))
      .resolves.toEqual({ success: false, error: error.message });

    expect(codexStore.loadEntries).not.toHaveBeenCalled();
  });

  it('keeps detection navigation, discard, and accept active after changing views', async () => {
    fixture.detectChanges();
    codexDetectionState.enqueue({
      bookId: 'book-1',
      sceneId: 'scene-1',
      entries: [
        { name: 'Elara Voss', type: 'character', description: 'A cartographer.' },
        { name: 'The Glass Harbor', type: 'location', description: 'A port.' },
      ],
    });
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();

    routerUrl = '/workspace/book-1/manuscript/book/book-1';
    document.querySelector<HTMLButtonElement>(
      '.codex-detection-modal [aria-label="Next detected entry"]',
    )!.click();
    fixture.detectChanges();
    expect(document.querySelector('.codex-detection-modal')?.textContent).toContain(
      'The Glass Harbor',
    );

    document.querySelector<HTMLButtonElement>('.codex-detection-modal .discard-button')!.click();
    fixture.detectChanges();
    expect(document.querySelector('.codex-detection-modal')?.textContent).toContain('Elara Voss');

    document.querySelector<HTMLButtonElement>('.codex-detection-modal .add-button')!.click();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 250));
    fixture.detectChanges();

    expect(codexService.createEntry).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      name: 'Elara Voss',
    }));
    expect(codexDetectionState.activeDetection('book-1')).toBeNull();
  });

  it('keeps the open batch stable and filters the next queued batch against the latest Codex', async () => {
    fixture.detectChanges();
    codexDetectionState.enqueue({
      bookId: 'book-1',
      sceneId: 'scene-1',
      entries: [{ name: 'First result', type: 'other', description: 'First.' }],
    });
    codexDetectionState.enqueue({
      bookId: 'book-1',
      sceneId: 'scene-2',
      entries: [
        { name: 'Elara', type: 'character', description: 'Existing.' },
        { name: 'Glass Harbor', type: 'location', description: 'New.' },
      ],
    });
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();

    expect(document.querySelector('.codex-detection-modal')?.textContent).toContain('First result');
    expect(document.querySelector('.codex-detection-modal')?.textContent).not.toContain('Glass Harbor');

    codexService.getEntries.mockResolvedValueOnce([existingCodexEntry('Elara', 'The Cartographer')]);
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    fixture.detectChanges();

    expect(codexService.getEntries).toHaveBeenCalledWith('book-1', { includeArchived: true });
    expect(codexDetectionState.activeDetection('book-1')).toEqual({
      bookId: 'book-1',
      sceneId: 'scene-2',
      entries: [{ name: 'Glass Harbor', type: 'location', description: 'New.' }],
    });
  });

  it('preserves a queued batch and retries its Codex refresh from the error notification', async () => {
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    codexDetectionState.enqueue({
      bookId: 'book-1',
      sceneId: 'scene-1',
      entries: [{ name: 'First result', type: 'other', description: 'First.' }],
    });
    const queued = {
      bookId: 'book-1',
      sceneId: 'scene-2',
      entries: [{ name: 'Glass Harbor', type: 'location' as const, description: 'New.' }],
    };
    codexDetectionState.enqueue(queued);
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();

    codexService.getEntries.mockRejectedValueOnce(new Error('Database unavailable'));
    document.querySelector<HTMLButtonElement>('.codex-detection-modal .close-button')!.click();
    await new Promise(resolve => setTimeout(resolve, 250));

    const retryToast = toastService.toasts().find(toast => toast.action?.label === 'Retry');
    expect(retryToast?.timeout).toBe(0);
    expect(codexDetectionState.activeDetection('book-1')).toBeNull();
    expect(codexDetectionState.nextQueued('book-1')).toBe(queued);

    codexService.getEntries.mockResolvedValueOnce([]);
    await retryToast!.action!.handler();

    expect(codexDetectionState.activeDetection('book-1')).toEqual(queued);
    expect(codexDetectionState.nextQueued('book-1')).toBeNull();
  });

  it('skips a queued batch that becomes empty and prepares the following result', async () => {
    const toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    codexDetectionState.enqueue({
      bookId: 'book-1',
      sceneId: 'scene-1',
      entries: [{ name: 'First result', type: 'other', description: 'First.' }],
    });
    codexDetectionState.enqueue({
      bookId: 'book-1',
      sceneId: 'scene-2',
      entries: [{ name: 'Elara', type: 'character', description: 'Existing.' }],
    });
    codexDetectionState.enqueue({
      bookId: 'book-1',
      sceneId: 'scene-3',
      entries: [{ name: 'Glass Harbor', type: 'location', description: 'New.' }],
    });
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    fixture.detectChanges();

    codexService.getEntries.mockResolvedValue([existingCodexEntry('Elara', null)]);
    document.querySelector<HTMLButtonElement>('.codex-detection-modal .close-button')!.click();
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(codexDetectionState.activeDetection('book-1')?.sceneId).toBe('scene-3');
    expect(toastService.toasts()).toContainEqual(expect.objectContaining({
      type: 'info',
      message: 'No new Codex entries were detected.',
    }));
  });
});

function existingCodexEntry(name: string, alias: string | null) {
  return {
    id: `codex-${name}`,
    bookId: 'book-1',
    type: 'character' as const,
    name,
    alias,
    description: null,
    image: null,
    status: 'active' as const,
    trackingSetting: 'include_when_detected' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}
