import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';
import type { CodexEntryMenuPayload } from '../../../../../../shared/models/codex-window.model';
import { ElementAnimationDirective } from '../../../../shared/directives/element-animation.directive';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { CodexContextTrieService } from '../../services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../../services/codex-entry-opener.service';
import { CodexWindowService } from '../../services/codex-window.service';
import { CodexStore } from '../../store/codex.store';
import { CodexSidebarSection } from './codex-sidebar-section';

describe('CodexSidebarSection', () => {
  let fixture: ComponentFixture<CodexSidebarSection>;
  let component: CodexSidebarSection;
  let codexEntryOpener: { open: ReturnType<typeof vi.fn> };
  let codexStore: ReturnType<typeof createCodexStore>;

  beforeEach(async () => {
    codexEntryOpener = { open: vi.fn() };
    codexStore = createCodexStore();

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
          useValue: codexStore,
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
      .overrideComponent(CodexSidebarSection, {
        set: {
          template: '<section appElementAnimation #entryAnimation="appElementAnimation">@for (entry of entries(); track entry.id) { <article [attr.data-codex-entry-id]="entry.id"></article> }</section>',
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CodexSidebarSection);
    component = fixture.componentInstance;
    fixture.detectChanges();
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

  it('animates the new entry card after creation', async () => {
    const existingEntry = createEntry({ id: 'codex-existing' });
    const createdEntry = createEntry({ id: 'codex-created' });
    codexStore.entries.set([existingEntry]);
    fixture.detectChanges();
    const existingElement = fixture.nativeElement.querySelector(
      '[data-codex-entry-id="codex-existing"]',
    ) as HTMLElement;
    vi.spyOn(existingElement, 'getBoundingClientRect')
      .mockReturnValueOnce({ top: 0 } as DOMRect)
      .mockReturnValueOnce({ top: 88 } as DOMRect);
    const reflowAnimation = vi.fn(() => ({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    }) as unknown as Animation);
    Object.defineProperty(existingElement, 'animate', {
      configurable: true,
      value: reflowAnimation,
    });
    codexStore.saveEntry.mockImplementationOnce(async () => {
      codexStore.entries.set([createdEntry, existingEntry]);
    });
    const animation = fixture.debugElement
      .query(By.directive(ElementAnimationDirective))
      .injector.get(ElementAnimationDirective);
    const animateAfterCreate = vi.spyOn(animation, 'animateAfterCreate')
      .mockImplementationOnce(async (action, targets) => {
        await action();
        const target = (targets as () => HTMLElement | null)();
        expect(target?.dataset['codexEntryId']).toBe('codex-created');
        expect(target?.classList.contains('codex-entry-pending')).toBe(false);
      });

    await component.saveEntry(createEntryPayload());

    expect(animateAfterCreate).toHaveBeenCalledOnce();
    expect(reflowAnimation).toHaveBeenCalledWith(
      [
        { transform: 'translateY(-88px)' },
        { transform: 'translateY(0)' },
      ],
      { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
    );
    expect(codexStore.saveEntry).toHaveBeenCalledWith('book-1', createEntryPayload());
  });

  it('animates the selected entry card before deletion', async () => {
    const selectedEntry = createEntry({ id: 'codex-deleted' });
    codexStore.entries.set([selectedEntry]);
    codexStore.selectedEntry.set(selectedEntry);
    fixture.detectChanges();
    codexStore.deleteEntry.mockImplementationOnce(async () => {
      codexStore.entries.set([]);
      codexStore.selectedEntry.set(null);
    });
    const animation = fixture.debugElement
      .query(By.directive(ElementAnimationDirective))
      .injector.get(ElementAnimationDirective);
    const animateBeforeDelete = vi.spyOn(animation, 'animateBeforeDelete')
      .mockImplementationOnce(async (target, action) => {
        expect((target as HTMLElement).dataset['codexEntryId']).toBe('codex-deleted');
        await action();
      });

    await component.deleteEntry();

    expect(animateBeforeDelete).toHaveBeenCalledOnce();
    expect(codexStore.deleteEntry).toHaveBeenCalledWith('book-1');
  });
});

function createCodexStore() {
  return {
    activeType: signal('character'),
    searchQuery: signal(''),
    entryFilters: signal({}),
    entries: signal<CodexEntryDto[]>([]),
    selectedEntry: signal<CodexEntryDto | null>(null),
    isLoadingEntries: signal(false),
    isLoadingSelectedEntry: signal(false),
    isCreatingEntry: signal(false),
    isSavingEntry: signal(false),
    error: signal(null),
    loadEntries: vi.fn(),
    saveEntry: vi.fn(),
    deleteEntry: vi.fn(),
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

function createEntryPayload(): CodexEntryMenuPayload {
  return {
    type: 'character',
    name: 'Mara Vale',
    alias: '',
    description: '',
    trackingSetting: 'include_when_detected',
    notes: [],
    progression: [],
  };
}
