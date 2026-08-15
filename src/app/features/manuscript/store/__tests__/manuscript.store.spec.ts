import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { vi } from 'vitest';

import { ElectronService } from '../../../../core/services/electron.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import type { SceneDto } from '../../../../../../shared/models/manuscript.model';
import { ManuscriptStore } from '../manuscript.store';

describe('ManuscriptStore structural insertion', () => {
  let store: InstanceType<typeof ManuscriptStore>;
  let manuscriptStructureService: {
    createScene: ReturnType<typeof vi.fn>;
  };
  let runInsertion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manuscriptStructureService = {
      createScene: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ManuscriptStore,
        { provide: ElectronService, useValue: { invoke: vi.fn() } },
        {
          provide: WorkspaceBookStore,
          useValue: {
            bookHierarchy: signal([]),
          },
        },
        { provide: ManuscriptStructureService, useValue: manuscriptStructureService },
      ],
    });

    store = TestBed.inject(ManuscriptStore);
    runInsertion = vi.fn();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not insert a created scene after navigation to another entity', async () => {
    let finishCreation!: (scene: SceneDto) => void;
    manuscriptStructureService.createScene.mockReturnValue(new Promise<SceneDto>(resolve => {
      finishCreation = resolve;
    }));

    store.setRouteParams('chapter', 'chapter-a');
    store.setEditor(createEditor({ chapterId: 'chapter-a', runInsertion }));

    const insertion = store.insertScene();
    store.setRouteParams('chapter', 'chapter-b');
    finishCreation(createScene());

    await insertion;

    expect(manuscriptStructureService.createScene).toHaveBeenCalledWith('chapter-a');
    expect(runInsertion).not.toHaveBeenCalled();
  });

  it('inserts a created scene when the active entity has not changed', async () => {
    manuscriptStructureService.createScene.mockResolvedValue(createScene());

    store.setRouteParams('chapter', 'chapter-a');
    store.setEditor(createEditor({ chapterId: 'chapter-a', runInsertion }));

    await store.insertScene();

    expect(runInsertion).toHaveBeenCalledOnce();
  });
});

interface CreateEditorOptions {
  chapterId: string;
  runInsertion: ReturnType<typeof vi.fn>;
}

function createEditor({ chapterId, runInsertion }: CreateEditorOptions): Editor {
  const chain = {
    focus: vi.fn(() => chain),
    command: vi.fn(() => chain),
    insertContentAt: vi.fn(() => chain),
    run: runInsertion,
  };

  return {
    state: {
      doc: {
        content: { size: 10 },
        descendants: (visitor: (node: { type: { name: string }; attrs: Record<string, string> }) => void) => {
          visitor({ type: { name: 'chapterHeader' }, attrs: { id: chapterId } });
        },
      },
    },
    chain: () => chain,
  } as unknown as Editor;
}

function createScene(): SceneDto {
  return {
    id: 'scene-new',
    title: 'New Scene',
    summary: '',
    position: 1,
  } as SceneDto;
}
