import { TestBed } from '@angular/core/testing';
import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { vi } from 'vitest';

import type { ActDto, SceneDto, TiptapJsonDoc } from '../../../../../../../shared/models/manuscript.model';
import { ElectronService } from '../../../../../core/services/electron.service';
import { ManuscriptSearchExtension } from '../../../extensions/manuscript-search.extension';
import { ManuscriptSearchService } from '../manuscript-search.service';

describe('ManuscriptSearchService', () => {
  let service: ManuscriptSearchService;
  let editor: Editor;
  const invoke = vi.fn();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ManuscriptSearchService,
        { provide: ElectronService, useValue: { invoke } },
      ],
    });
    service = TestBed.inject(ManuscriptSearchService);
    editor = createEditor();
    service.attachEditor(editor);
    invoke.mockReset();
  });

  afterEach(() => editor.destroy());

  it('owns current-view results, selection, and decoration cleanup', () => {
    service.setCurrentScopeData(manuscript([
      scene('scene-1', 'sea and sea'),
    ]));
    service.show();
    service.updateQuery('sea');

    expect(service.matches()).toHaveLength(2);
    expect(service.currentMatchNumber()).toBe(1);
    expect(editor.view.dom.querySelectorAll('.manuscript-search-match')).toHaveLength(2);

    service.select(1);
    expect(service.currentMatchNumber()).toBe(2);
    service.select(1);
    expect(service.currentMatchNumber()).toBe(1);

    service.close();
    expect(service.open()).toBe(false);
    expect(service.query()).toBe('');
    expect(editor.view.dom.querySelectorAll('.manuscript-search-match')).toHaveLength(0);
  });

  it('loads and searches the whole manuscript through the existing IPC channel', async () => {
    const wholeData = manuscript([
      scene('scene-1', 'sea and sea'),
      scene('scene-2', 'distant sea'),
    ]);
    invoke.mockResolvedValue(wholeData);
    service.setCurrentScopeData(wholeData[0].chapters![0].scenes![0]);
    service.show();
    service.updateQuery('sea');

    await service.updateScope({ wholeManuscript: true, bookId: 'book-1', mode: 'scene' });

    expect(invoke).toHaveBeenCalledWith('manuscript:get', { mode: 'book', id: 'book-1' });
    expect(service.matches()).toHaveLength(3);
    expect(service.matches()[2].sceneId).toBe('scene-2');
  });
});

function createEditor(): Editor {
  const structuralNode = (name: string) => Node.create({
    name,
    group: 'block',
    atom: true,
    addAttributes: () => ({ id: { default: '' } }),
    renderHTML: ({ HTMLAttributes }) => ['div', HTMLAttributes],
  });

  return new Editor({
    extensions: [
      StarterKit,
      structuralNode('sceneSummary'),
      ManuscriptSearchExtension,
    ],
    content: {
      type: 'doc',
      content: [
        { type: 'sceneSummary', attrs: { id: 'scene-1' } },
        paragraph('sea and sea'),
      ],
    },
  });
}

function manuscript(scenes: SceneDto[]): ActDto[] {
  return [{
    id: 'act-1', title: '', bookId: 'book-1', position: 0, status: 'active', summary: null,
    chapters: [{
      id: 'chapter-1', title: '', actId: 'act-1', position: 0, status: 'active', summary: null, scenes,
    }],
  }];
}

function scene(id: string, text: string): SceneDto {
  return {
    id, title: '', chapterId: 'chapter-1', position: 0, status: 'active',
    prose: { type: 'doc', content: [paragraph(text)] } satisfies TiptapJsonDoc,
    summary: null, wordCount: null, pointOfViewOverride: null, povCharacterIdOverride: null,
  };
}

function paragraph(text: string): any {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
