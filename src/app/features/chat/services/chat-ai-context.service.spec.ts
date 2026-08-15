import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import type { ChatMessageDetailDto } from '../../../../../shared/models/chat.model';
import type { CodexEntryDetailDto } from '../../../../../shared/models/codex.model';
import type { ActDto, TiptapJsonDoc } from '../../../../../shared/models/manuscript.model';
import { ElectronService } from '../../../core/services/electron.service';
import { CodexService } from '../../codex/services/codex.service';
import { ChatAiContextService } from './chat-ai-context.service';

describe('ChatAiContextService', () => {
  let service: ChatAiContextService;
  let electronService: { invoke: ReturnType<typeof vi.fn> };
  let codexService: { getEntry: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    electronService = { invoke: vi.fn() };
    codexService = { getEntry: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        ChatAiContextService,
        { provide: ElectronService, useValue: electronService },
        { provide: CodexService, useValue: codexService },
      ],
    });
    service = TestBed.inject(ChatAiContextService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('returns no context without refs or Full Outline', async () => {
    await expect(service.buildContextMessage({
      userMessage: makeMessage(),
      bookId: 'book-1',
      hierarchy: hierarchy(),
    })).resolves.toBeNull();

    expect(electronService.invoke).not.toHaveBeenCalled();
    expect(codexService.getEntry).not.toHaveBeenCalled();
  });

  it('serializes selected scene prose and Codex details for the current message snapshot', async () => {
    const prose: TiptapJsonDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Mara enters the observatory.' }],
      }],
    };
    electronService.invoke.mockResolvedValueOnce({ 'scene-1': prose });
    codexService.getEntry.mockResolvedValueOnce(codexEntry());

    const result = await service.buildContextMessage({
      userMessage: makeMessage({
        sceneRefs: [{ messageId: 'user-1', sceneId: 'scene-1' }],
        codexRefs: [{ messageId: 'user-1', codexEntryId: 'codex-1' }],
      }),
      bookId: 'book-1',
      bookTitle: 'Night Draft',
      hierarchy: hierarchy(),
    });

    expect(electronService.invoke).toHaveBeenCalledWith(
      'manuscript:getScenesProse',
      { sceneIds: ['scene-1'] },
    );
    expect(result?.content).toContain('## Selected Manuscript Context');
    expect(result?.content).toContain('Mara enters the observatory.');
    expect(result?.content).toContain('## Codex Context');
    expect(result?.content).toContain('Name: Mara Vale');
    expect(result?.content).toContain('Arrival: Enters the observatory.');
  });

  it('loads and serializes Full Outline independently from selected scenes', async () => {
    electronService.invoke.mockResolvedValueOnce(hierarchy());

    const result = await service.buildContextMessage({
      userMessage: makeMessage({ includeFullOutline: true }),
      bookId: 'book-1',
      bookTitle: 'Night Draft',
      hierarchy: hierarchy(),
    });

    expect(electronService.invoke).toHaveBeenCalledWith(
      'manuscript:getOutline',
      { bookId: 'book-1' },
    );
    expect(result?.content).toContain('## Full Outline');
    expect(result?.content).toContain('Opening summary.');
  });
});

function makeMessage(
  overrides: Partial<ChatMessageDetailDto> = {},
): ChatMessageDetailDto {
  return {
    id: 'user-1',
    threadId: 'thread-1',
    parentMessageId: null,
    branchGroupId: 'branch-1',
    branchOrder: 0,
    role: 'user',
    content: 'Continue the story',
    status: 'complete',
    position: 0,
    modelId: null,
    provider: null,
    inputTokens: null,
    outputTokens: null,
    reasoningSummary: null,
    error: null,
    includeFullOutline: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    sceneRefs: [],
    codexRefs: [],
    ...overrides,
  };
}

function hierarchy(): ActDto[] {
  return [{
    id: 'act-1',
    bookId: 'book-1',
    title: 'Act One',
    position: 0,
    status: 'active',
    summary: 'Act summary.',
    chapters: [{
      id: 'chapter-1',
      actId: 'act-1',
      title: 'Chapter One',
      position: 0,
      status: 'active',
      summary: 'Chapter summary.',
      scenes: [{
        id: 'scene-1',
        chapterId: 'chapter-1',
        title: 'Opening',
        position: 0,
        status: 'active',
        prose: null,
        summary: 'Opening summary.',
        wordCount: 0,
        pointOfViewOverride: null,
        povCharacterIdOverride: null,
      }],
    }],
  }];
}

function codexEntry(): CodexEntryDetailDto {
  return {
    id: 'codex-1',
    bookId: 'book-1',
    type: 'character',
    name: 'Mara Vale',
    alias: null,
    description: 'An astronomer.',
    image: null,
    status: 'active',
    trackingSetting: 'include_when_detected',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    entryNotes: [],
    entryProgression: [{
      id: 'progression-1',
      codexEntryId: 'codex-1',
      title: 'Arrival',
      description: 'Enters the observatory.',
      sceneId: 'scene-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
    }],
  };
}
