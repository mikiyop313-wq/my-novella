import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { CodexContextTrieService } from '../../services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../../services/codex-entry-opener.service';
import { CodexWindowService } from '../../services/codex-window.service';
import { CodexStore } from '../../store/codex.store';
import { CodexSidebarSection } from './codex-sidebar-section';

describe('CodexSidebarSection entry opening', () => {
  let fixture: ComponentFixture<CodexSidebarSection>;
  let component: CodexSidebarSection;
  let codexEntryOpener: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    codexEntryOpener = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CodexSidebarSection],
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            bookId: signal('book-1'),
            sidebarOpen: signal(true),
            openSidebar: vi.fn(),
          },
        },
        {
          provide: WorkspaceBookStore,
          useValue: { bookHierarchy: signal([]) },
        },
        {
          provide: CodexStore,
          useValue: createCodexStore(),
        },
        {
          provide: CodexContextTrieService,
          useValue: { refreshCurrentContext: vi.fn() },
        },
        {
          provide: CodexEntryOpenerService,
          useValue: codexEntryOpener,
        },
        {
          provide: CodexWindowService,
          useValue: {
            onDetachedEntryChanged: vi.fn(() => vi.fn()),
          },
        },
      ],
    })
      .overrideComponent(CodexSidebarSection, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(CodexSidebarSection);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('delegates the selected entry ID to the opener service', async () => {
    codexEntryOpener.open.mockResolvedValueOnce(undefined);

    await component.openEntry(createEntry({ id: 'codex-7' }));

    expect(codexEntryOpener.open).toHaveBeenCalledWith('codex-7');
  });
});

function createCodexStore(): Record<string, unknown> {
  return {
    activeType: signal('character'),
    searchQuery: signal(''),
    entryFilters: signal({}),
    entries: signal([]),
    selectedEntry: signal(null),
    isLoadingEntries: signal(false),
    isLoadingSelectedEntry: signal(false),
    isCreatingEntry: signal(false),
    isSavingEntry: signal(false),
    error: signal(null),
    loadEntries: vi.fn(),
  };
}

function createEntry(overrides: Partial<CodexEntryDto> = {}): CodexEntryDto {
  return {
    id: 'codex-1',
    bookId: 'book-1',
    type: 'character',
    name: 'Mara Vale',
    alias: null,
    description: null,
    image: null,
    status: 'active',
    trackingSetting: 'include_when_detected',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
