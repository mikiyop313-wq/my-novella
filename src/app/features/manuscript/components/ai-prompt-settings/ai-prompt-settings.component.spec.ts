import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';
import { AiStore } from '../../../../core/store/ai.store';
import { CodexService } from '../../../codex/services/codex.service';
import { LibraryStore } from '../../../library/store/book.store';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { AiPromptSettingsComponent } from './ai-prompt-settings.component';

describe('AiPromptSettingsComponent', () => {
  let fixture: ComponentFixture<AiPromptSettingsComponent>;
  let component: AiPromptSettingsComponent;
  let bookId: WritableSignal<string | null>;
  let books: WritableSignal<Array<{
    id: string;
    settings: { vectorSearchEnabled?: boolean };
  }>>;
  let getEntries: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bookId = signal<string | null>('book-1');
    books = signal([]);
    getEntries = vi.fn();

    await TestBed.configureTestingModule({
      imports: [AiPromptSettingsComponent],
      providers: [
        { provide: WorkspaceStore, useValue: { bookId } },
        {
          provide: LibraryStore,
          useValue: {
            books,
            loadBooks: vi.fn(),
          },
        },
        { provide: AiStore, useValue: { models: signal([]) } },
        { provide: CodexService, useValue: { getEntries } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiPromptSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads active characters for the current book when settings are opened', async () => {
    getEntries.mockResolvedValue([
      createCharacter('character-1', 'Ari'),
      createCharacter('character-2', 'Zara'),
    ]);

    (fixture.nativeElement.querySelector('.settings-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(getEntries).toHaveBeenCalledWith('book-1', {
      type: 'character',
      status: 'active',
    });
    expect(component.characters()).toEqual([
      { value: 'character-1', label: 'Ari' },
      { value: 'character-2', label: 'Zara' },
    ]);
    expect(component.povCharacterOptions()).toEqual([
      { value: null, label: 'None' },
      { value: 'character-1', label: 'Ari' },
      { value: 'character-2', label: 'Zara' },
    ]);
    expect(component.characterLoadState()).toBe('loaded');
  });

  it('emits the selected POV character ID', () => {
    const emitted = vi.fn();
    component.povCharacterChange.subscribe(emitted);

    component.onPovCharacterSelectionChange('character-1');

    expect(emitted).toHaveBeenCalledWith('character-1');
  });

  it('emits null when the None POV character option is selected', () => {
    const emitted = vi.fn();
    component.povCharacterChange.subscribe(emitted);

    component.onPovCharacterSelectionChange(null);

    expect(emitted).toHaveBeenCalledWith(null);
  });

  it('emits zero when automatic word count is selected', () => {
    const emitted = vi.fn();
    component.wordCountChange.subscribe(emitted);

    component.onWordCountPresetSelect(0);

    expect(emitted).toHaveBeenCalledWith(0);
  });

  it('emits global when vector search inheritance is enabled', () => {
    const emitted = vi.fn();
    component.vectorSearchChange.subscribe(emitted);

    component.onInheritVectorSearchChange(checkboxEvent(true));

    expect(emitted).toHaveBeenCalledWith('global');
  });

  it('emits the enabled global value when vector search inheritance is removed', () => {
    books.set([{ id: 'book-1', settings: { vectorSearchEnabled: true } }]);
    const emitted = vi.fn();
    component.vectorSearchChange.subscribe(emitted);

    component.onInheritVectorSearchChange(checkboxEvent(false));

    expect(emitted).toHaveBeenCalledWith('enabled');
  });

  it('emits the disabled global value when vector search inheritance is removed', () => {
    books.set([{ id: 'book-1', settings: { vectorSearchEnabled: false } }]);
    const emitted = vi.fn();
    component.vectorSearchChange.subscribe(emitted);

    component.onInheritVectorSearchChange(checkboxEvent(false));

    expect(emitted).toHaveBeenCalledWith('disabled');
  });

  it('emits enabled and disabled when vector search is toggled', () => {
    const emitted = vi.fn();
    component.vectorSearchChange.subscribe(emitted);

    component.onVectorSearchToggleChange(checkboxEvent(true));
    component.onVectorSearchToggleChange(checkboxEvent(false));

    expect(emitted).toHaveBeenNthCalledWith(1, 'enabled');
    expect(emitted).toHaveBeenNthCalledWith(2, 'disabled');
  });

  it('does not query Codex without a current book', async () => {
    bookId.set(null);
    fixture.detectChanges();

    await component.loadPovCharacters();

    expect(getEntries).not.toHaveBeenCalled();
    expect(component.characters()).toEqual([]);
    expect(component.characterLoadState()).toBe('loaded');
    expect(component.characterEmptyText()).toBe('No characters in Codex.');
  });

  it('keeps an empty option list when no characters exist', async () => {
    getEntries.mockResolvedValue([]);

    await component.loadPovCharacters();

    expect(component.characters()).toEqual([]);
    expect(component.characterLoadState()).toBe('loaded');
    expect(component.characterEmptyText()).toBe('No characters in Codex.');
  });

  it('reports a load failure without retaining invalid options', async () => {
    getEntries.mockRejectedValue(new Error('Codex unavailable'));

    await component.loadPovCharacters();

    expect(component.characters()).toEqual([]);
    expect(component.characterLoadState()).toBe('error');
    expect(component.characterEmptyText()).toBe('Unable to load characters.');
  });

  it('ignores a response for a book that is no longer active', async () => {
    const pending = deferred<CodexEntryDto[]>();
    getEntries.mockReturnValue(pending.promise);

    const load = component.loadPovCharacters();
    bookId.set('book-2');
    fixture.detectChanges();
    pending.resolve([createCharacter('character-1', 'Ari')]);
    await load;

    expect(component.characters()).toEqual([]);
    expect(component.characterLoadState()).toBe('idle');
  });
});

function createCharacter(id: string, name: string): CodexEntryDto {
  return {
    id,
    bookId: 'book-1',
    type: 'character',
    name,
    alias: null,
    description: null,
    image: null,
    status: 'active',
    trackingSetting: 'include_when_detected',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function checkboxEvent(checked: boolean): Event {
  return { target: { checked } } as unknown as Event;
}
