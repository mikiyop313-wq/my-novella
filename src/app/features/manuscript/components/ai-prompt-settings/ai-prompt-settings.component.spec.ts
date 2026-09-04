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
  let models: WritableSignal<Array<{
    id: string;
    supportsReasoning?: boolean;
  }>>;
  let getEntries: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bookId = signal<string | null>('book-1');
    books = signal([]);
    models = signal([]);
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
        { provide: AiStore, useValue: { models } },
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

  it('keeps the effort chevron visible and enables it with compact level text', () => {
    models.set([{ id: 'reasoning-model', supportsReasoning: true }]);
    fixture.componentRef.setInput('selectedModel', 'reasoning-model');
    fixture.componentRef.setInput('reasoningMode', false);
    fixture.componentRef.setInput('reasoningEffort', 'medium');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.settings-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const trigger = document.querySelector(
      '.reasoning-effort-menu .dropdown-trigger',
    ) as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.disabled).toBe(true);
    expect(document.querySelector('.reasoning-status')?.textContent?.trim()).toBe('Off');

    fixture.componentRef.setInput('reasoningMode', true);
    fixture.detectChanges();

    expect(trigger.disabled).toBe(false);
    expect(document.querySelector('.reasoning-status')?.textContent?.trim()).toBe('Medium');
  });

  it('opens Low, Medium, and High from the left chevron without search', async () => {
    models.set([{ id: 'reasoning-model', supportsReasoning: true }]);
    fixture.componentRef.setInput('selectedModel', 'reasoning-model');
    fixture.componentRef.setInput('reasoningMode', true);
    fixture.componentRef.setInput('reasoningEffort', 'medium');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.settings-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    (document.querySelector(
      '.reasoning-effort-menu .dropdown-trigger',
    ) as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = [...document.querySelectorAll(
      '.prompt-reasoning-effort-dropdown .menu-row',
    )] as HTMLElement[];
    expect(rows.map(row => row.textContent?.trim())).toEqual(['Low', 'Medium', 'High']);
    expect(document.querySelector('.prompt-reasoning-effort-dropdown .dropdown-search')).toBeNull();
    expect(document.querySelector('.reasoning-chevron.is-open')).not.toBeNull();

    const emitted = vi.fn();
    component.reasoningEffortChange.subscribe(emitted);
    rows[2].click();
    expect(emitted).toHaveBeenCalledWith('high');

    fixture.componentRef.setInput('reasoningEffort', 'high');
    fixture.detectChanges();
    expect(document.querySelector('.reasoning-status')?.textContent?.trim()).toBe('High');
  });

  it.each(['low', 'medium', 'high'] as const)(
    'emits the selected %s reasoning effort',
    (effort) => {
      const emitted = vi.fn();
      component.reasoningEffortChange.subscribe(emitted);

      component.onReasoningEffortChange(effort);

      expect(emitted).toHaveBeenCalledWith(effort);
    },
  );

  it('preserves reasoning while no model is selected during initialization', () => {
    const modeChanged = vi.fn();
    component.reasoningModeChange.subscribe(modeChanged);

    fixture.componentRef.setInput('reasoningMode', true);
    fixture.detectChanges();

    expect(modeChanged).not.toHaveBeenCalled();
  });

  it('preserves reasoning while selected model metadata is unresolved', () => {
    const modeChanged = vi.fn();
    component.reasoningModeChange.subscribe(modeChanged);

    fixture.componentRef.setInput('selectedModel', 'unresolved-model');
    fixture.componentRef.setInput('reasoningMode', true);
    fixture.detectChanges();

    expect(modeChanged).not.toHaveBeenCalled();
  });

  it('preserves reasoning on and off for a supported model', () => {
    const modeChanged = vi.fn();
    component.reasoningModeChange.subscribe(modeChanged);
    models.set([{ id: 'reasoning-model', supportsReasoning: true }]);
    fixture.componentRef.setInput('selectedModel', 'reasoning-model');

    fixture.componentRef.setInput('reasoningMode', true);
    fixture.detectChanges();
    fixture.componentRef.setInput('reasoningMode', false);
    fixture.detectChanges();

    expect(modeChanged).not.toHaveBeenCalled();
  });

  it('turns reasoning off for an unsupported model without changing its effort', () => {
    const modeChanged = vi.fn();
    component.reasoningModeChange.subscribe(modeChanged);
    models.set([{ id: 'standard-model', supportsReasoning: false }]);
    fixture.componentRef.setInput('selectedModel', 'standard-model');
    fixture.componentRef.setInput('reasoningMode', true);
    fixture.componentRef.setInput('reasoningEffort', 'high');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.settings-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(modeChanged).toHaveBeenCalledWith(false);
    expect(component.reasoningEffort()).toBe('high');
    expect((document.querySelector(
      '.reasoning-effort-menu .dropdown-trigger',
    ) as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector(
      '.reasoning-switch input',
    ) as HTMLInputElement).disabled).toBe(true);
    expect(document.querySelector('.reasoning-status')?.textContent?.trim()).toBe('Not supported');
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
