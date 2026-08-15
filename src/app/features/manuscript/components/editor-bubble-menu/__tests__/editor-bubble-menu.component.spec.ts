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

  it('rejects a blank Other instruction without starting the effect', () => {
    const startSpy = vi.spyOn(component.aiSelectionEffect, 'startEdit');
    component.isVisible.set(true);

    expect(component.other('   ')).toBe(false);

    expect(startSpy).not.toHaveBeenCalled();
    expect(component.isVisible()).toBe(true);
  });
});
