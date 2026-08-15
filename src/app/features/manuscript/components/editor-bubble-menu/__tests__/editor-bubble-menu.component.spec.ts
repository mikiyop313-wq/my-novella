import { Overlay } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManuscriptStore } from '../../../store/manuscript.store';
import { EditorBubbleMenuComponent } from '../editor-bubble-menu.component';

describe('EditorBubbleMenuComponent AI actions', () => {
  let component: EditorBubbleMenuComponent;
  let fixture: ComponentFixture<EditorBubbleMenuComponent>;

  beforeEach(async () => {
    const editor = {
      state: {
        selection: { from: 1, to: 12, empty: false },
        doc: {
          textBetween: vi.fn(() => 'Selected text'),
          nodesBetween: vi.fn(),
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
        { provide: Overlay, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorBubbleMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it.each([
    ['rephrase', () => component.rephrase()],
    ['shorten', () => component.shorten()],
    ['expand', () => component.expand()],
    ['other', () => component.other('Make it more tense')],
  ])('delegates %s to the AI selection effect and hides the menu on success', (_name, run) => {
    const startSpy = vi.spyOn(component.aiSelectionEffect, 'start').mockReturnValue(true);
    component.isVisible.set(true);

    run();

    expect(startSpy).toHaveBeenCalledOnce();
    expect(component.isVisible()).toBe(false);
  });

  it('keeps the menu visible when the effect cannot start', () => {
    vi.spyOn(component.aiSelectionEffect, 'start').mockReturnValue(false);
    component.isVisible.set(true);

    component.rephrase();

    expect(component.isVisible()).toBe(true);
  });
});
