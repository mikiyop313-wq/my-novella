import { Overlay } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManuscriptStore } from '../../../store/manuscript.store';
import { AiStreamEditorService } from '../../../helpers/ai/ai-stream-editor.service';
import { EditorBubbleMenuComponent } from '../editor-bubble-menu.component';

describe('EditorBubbleMenuComponent AI actions', () => {
  let component: EditorBubbleMenuComponent;
  let fixture: ComponentFixture<EditorBubbleMenuComponent>;
  const hasActiveSceneGeneration = vi.fn((_sceneId: string) => false);

  beforeEach(async () => {
    const editor = {
      state: {
        selection: { from: 1, to: 12, empty: false },
        doc: {
          textBetween: vi.fn(() => 'Selected text'),
          nodesBetween: vi.fn(),
          forEach: vi.fn(),
        },
      },
      on: vi.fn(),
      off: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as Editor;

    await TestBed.configureTestingModule({
      imports: [EditorBubbleMenuComponent],
      providers: [
        { provide: ManuscriptStore, useValue: { editor: signal(editor) } },
        { provide: AiStreamEditorService, useValue: { hasActiveSceneGeneration } },
        { provide: Overlay, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorBubbleMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    hasActiveSceneGeneration.mockReset();
    hasActiveSceneGeneration.mockReturnValue(false);
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it.each([
    ['rephrase', () => component.rephrase(), {
      category: 'rephrase', instruction: 'Rephrase the marked passage.', actionLabel: 'Rephrase',
    }],
    ['shorten', () => component.shorten(), {
      category: 'shorten', instruction: 'Shorten the marked passage.', actionLabel: 'Shorten',
    }],
    ['expand', () => component.expand(), {
      category: 'expand', instruction: 'Expand the marked passage.', actionLabel: 'Expand',
    }],
    ['other', () => component.other('  Make it more tense  '), {
      category: 'rephrase', instruction: 'Make it more tense', actionLabel: 'Other',
    }],
  ])('delegates %s with the correct request and hides the menu on success', (_name, run, request) => {
    const startSpy = vi.spyOn(component.aiSelectionEffect, 'startEdit').mockReturnValue(true);
    component.isVisible.set(true);

    expect(run()).toBe(true);

    expect(startSpy).toHaveBeenCalledWith(request);
    expect(component.isVisible()).toBe(false);
  });

  it('keeps the menu visible when the effect cannot start', () => {
    vi.spyOn(component.aiSelectionEffect, 'startEdit').mockReturnValue(false);
    component.isVisible.set(true);

    expect(component.rephrase()).toBe(false);

    expect(component.isVisible()).toBe(true);
  });

  it('does not globally disable Ask AI while another scene has an active edit', () => {
    component.aiSelectionEffect.activeEditCount.set(1);

    expect(component.isAskAiDisabled()).toBe(false);
  });

  it('rejects a blank Other instruction without starting the effect', () => {
    const startSpy = vi.spyOn(component.aiSelectionEffect, 'startEdit');
    component.isVisible.set(true);

    expect(component.other('   ')).toBe(false);

    expect(startSpy).not.toHaveBeenCalled();
    expect(component.isVisible()).toBe(true);
  });

  it('mutes Ask AI and rejects selection edits while the same scene is generating', () => {
    const editor = component.store.editor()!;
    vi.spyOn(editor.state.doc, 'forEach').mockImplementation((callback: any) => {
      callback({ type: { name: 'sceneSummary' }, attrs: { id: 'scene-1' } }, 0);
    });
    hasActiveSceneGeneration.mockImplementation(sceneId => sceneId === 'scene-1');
    const startSpy = vi.spyOn(component.aiSelectionEffect, 'startEdit');

    expect(component.isAskAiDisabled()).toBe(true);
    expect(component.rephrase()).toBe(false);
    expect(startSpy).not.toHaveBeenCalled();
  });

});
