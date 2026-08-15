import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { CodexStore } from '../store/codex.store';
import { CodexEntryOpenerService } from './codex-entry-opener.service';
import { CodexWindowService } from './codex-window.service';

describe('CodexEntryOpenerService', () => {
  let service: CodexEntryOpenerService;
  let codexStore: {
    closeCreateMenu: ReturnType<typeof vi.fn>;
    openEntryById: ReturnType<typeof vi.fn>;
  };
  let codexWindowService: {
    focusDetachedEntry: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    codexStore = {
      closeCreateMenu: vi.fn(),
      openEntryById: vi.fn(),
    };
    codexWindowService = {
      focusDetachedEntry: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CodexEntryOpenerService,
        { provide: CodexStore, useValue: codexStore },
        { provide: CodexWindowService, useValue: codexWindowService },
      ],
    });

    service = TestBed.inject(CodexEntryOpenerService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does nothing for an empty entry ID', async () => {
    await service.open('');

    expect(codexWindowService.focusDetachedEntry).not.toHaveBeenCalled();
    expect(codexStore.openEntryById).not.toHaveBeenCalled();
    expect(codexStore.closeCreateMenu).not.toHaveBeenCalled();
  });

  it('focuses a detached entry and closes the workspace menu without reloading', async () => {
    codexWindowService.focusDetachedEntry.mockResolvedValueOnce(true);

    await service.open('codex-1');

    expect(codexWindowService.focusDetachedEntry).toHaveBeenCalledWith('codex-1');
    expect(codexStore.closeCreateMenu).toHaveBeenCalledOnce();
    expect(codexStore.openEntryById).not.toHaveBeenCalled();
  });

  it('loads an entry by ID when it is not detached', async () => {
    codexWindowService.focusDetachedEntry.mockResolvedValueOnce(false);
    codexStore.openEntryById.mockResolvedValueOnce(undefined);

    await service.open('codex-2');

    expect(codexWindowService.focusDetachedEntry).toHaveBeenCalledWith('codex-2');
    expect(codexStore.openEntryById).toHaveBeenCalledWith('codex-2');
    expect(codexStore.closeCreateMenu).not.toHaveBeenCalled();
  });
});
