import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CodexEntryDetailDto, CodexEntryDto } from '../../../../../../shared/models/codex.model';
import type { CodexEntryMenuPayload } from '../../../../../../shared/models/codex-window.model';
import { CodexEntryPersistenceService } from '../codex-entry-persistence.service';
import { CodexService } from '../codex.service';

describe('CodexEntryPersistenceService', () => {
  let service: CodexEntryPersistenceService;
  let codexService: {
    createEntry: ReturnType<typeof vi.fn>;
    getEntry: ReturnType<typeof vi.fn>;
    updateEntry: ReturnType<typeof vi.fn>;
    createEntryNote: ReturnType<typeof vi.fn>;
    createEntryProgression: ReturnType<typeof vi.fn>;
    updateEntryNote: ReturnType<typeof vi.fn>;
    deleteEntryNote: ReturnType<typeof vi.fn>;
    updateEntryProgression: ReturnType<typeof vi.fn>;
    deleteEntryProgression: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    const entry = createEntry();
    codexService = {
      createEntry: vi.fn().mockResolvedValue(entry),
      getEntry: vi.fn().mockResolvedValue(entry),
      updateEntry: vi.fn().mockResolvedValue(entry),
      createEntryNote: vi.fn(),
      createEntryProgression: vi.fn(),
      updateEntryNote: vi.fn(),
      deleteEntryNote: vi.fn(),
      updateEntryProgression: vi.fn(),
      deleteEntryProgression: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CodexEntryPersistenceService,
        { provide: CodexService, useValue: codexService },
      ],
    });
    service = TestBed.inject(CodexEntryPersistenceService);
  });

  it('forwards a selected image when creating an entry', async () => {
    const image = 'data:image/webp;base64,Y29kZXg=';

    await service.createEntry('book-1', createPayload({ image }));

    expect(codexService.createEntry).toHaveBeenCalledWith(expect.objectContaining({ image }));
  });

  it('forwards a replacement image when updating an entry', async () => {
    const image = 'data:image/webp;base64,cmVwbGFjZW1lbnQ=';

    await service.updateEntry(createEntry(), createPayload({ image }));

    expect(codexService.updateEntry).toHaveBeenCalledWith(
      'codex-1',
      expect.objectContaining({ image }),
    );
  });

  it('omits the image from an update when it was not changed', async () => {
    await service.updateEntry(createEntry(), createPayload());

    const update = codexService.updateEntry.mock.calls[0]?.[1];
    expect(update).not.toHaveProperty('image');
  });

  it.each([
    {
      name: 'body-only notes',
      note: { id: null, title: '', content: 'First paragraph.\n\nSecond paragraph.' },
    },
    {
      name: 'title-and-body notes',
      note: { id: null, title: 'A warning', content: 'Do not open the door.' },
    },
    {
      name: 'title-only notes',
      note: { id: null, title: 'A warning', content: '' },
    },
  ])('stores separate title and content fields for $name', async ({ note }) => {
    await service.createEntry('book-1', createPayload({ notes: [note] }));

    expect(codexService.createEntryNote).toHaveBeenCalledWith({
      codexEntryId: 'codex-1',
      title: note.title,
      content: note.content,
    });
  });

  it('updates note titles and content as separate fields', async () => {
    const existingEntry = createEntry({
      entryNotes: [{
        id: 'note-1',
        codexEntryId: 'codex-1',
        title: 'Old title',
        content: 'Old content',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastEditedAt: '2026-01-01T00:00:00.000Z',
      }],
    });

    await service.updateEntry(existingEntry, createPayload({
      notes: [{ id: 'note-1', title: '', content: 'Updated content' }],
    }));

    expect(codexService.updateEntryNote).toHaveBeenCalledWith('note-1', {
      title: '',
      content: 'Updated content',
    });
  });
});

function createPayload(overrides: Partial<CodexEntryMenuPayload> = {}): CodexEntryMenuPayload {
  return {
    type: 'character',
    name: 'Mara Vale',
    alias: '',
    description: '',
    trackingSetting: 'include_when_detected',
    notes: [],
    progression: [],
    ...overrides,
  };
}

function createEntry(overrides: Partial<CodexEntryDetailDto> = {}): CodexEntryDetailDto {
  const entry: CodexEntryDto = {
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
  };

  return { ...entry, entryNotes: [], entryProgression: [], ...overrides };
}
