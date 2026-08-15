import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CodexEntryDetailDto, CodexEntryDto } from '../../../../../../shared/models/codex.model';
import type { CodexEntryMenuPayload } from '../../../../../../shared/models/codex-window.model';
import { CodexEntryPersistenceService } from '../codex-entry-persistence.service';
import { CodexService } from '../codex.service';

describe('CodexEntryPersistenceService images', () => {
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

function createEntry(): CodexEntryDetailDto {
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

  return { ...entry, entryNotes: [], entryProgression: [] };
}
