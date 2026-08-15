import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ChildrenOutletContexts, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NEVER, of } from 'rxjs';

import type { ChatThreadDetailDto } from '../../../../shared/models/chat.model';
import { ChatStore } from '../chat/store/chat.store';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { Workspace } from './workspace';
import { WorkspaceBookStore } from './workspace-book.store';
import { WorkspaceStore } from './workspace.store';

function makeThread(overrides: Partial<ChatThreadDetailDto> = {}): ChatThreadDetailDto {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'Draft chat',
    status: 'active',
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

  beforeEach(async () => {
    currentBookId = null;
    selectedThread = null;
    lastManuscriptRoutes = {};
    routerUrl = '/workspace/book-1/outline';

    await TestBed.configureTestingModule({
      imports: [Workspace],
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            activeView: vi.fn(() => 'outline'),
            enterBook: vi.fn(),
            setActiveView: vi.fn(),
            rememberManuscriptRoute: vi.fn((bookId, route) => {
              lastManuscriptRoutes[bookId] = route;
            }),
            getLastManuscriptRoute: vi.fn((bookId: string) => lastManuscriptRoutes[bookId] ?? null),
          },
        },
        { provide: WorkspaceBookStore, useValue: { clearBookHierarchy: vi.fn() } },
        {
          provide: ChatStore,
          useValue: {
            bookId: vi.fn(() => currentBookId),
            selectedThread: vi.fn(() => selectedThread),
          },
        },
        { provide: CodexContextTrieService, useValue: { loadForContext: vi.fn() } },
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
      .overrideComponent(Workspace, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(Workspace);
    component = fixture.componentInstance;
  });

  it('loads Codex context trie when entering the workspace book', () => {
    const codexContextTrie = TestBed.inject(CodexContextTrieService);

    fixture.detectChanges();

    expect(codexContextTrie.loadForContext).toHaveBeenCalledWith('book-1');
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
});
