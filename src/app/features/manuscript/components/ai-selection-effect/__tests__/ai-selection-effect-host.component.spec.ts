import { signal, type ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { WorkspaceStore } from '../../../../workspace/workspace.store';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { AiSelectionEditService } from '../../../helpers/ai/ai-selection-edit.service';
import { AiSelectionEffectHostComponent } from '../ai-selection-effect-host.component';
import { AiSelectionEffectComponent } from '../ai-selection-effect.component';

const request = {
  category: 'rephrase' as const,
  instruction: 'Rephrase the marked passage.',
  actionLabel: 'Rephrase' as const,
};

describe('AiSelectionEffectHostComponent', () => {
  let fixture: ComponentFixture<AiSelectionEffectHostComponent>;
  let component: AiSelectionEffectHostComponent;
  let startEdit: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    startEdit = vi.fn(() => 'selection-1');
    await TestBed.configureTestingModule({
      imports: [AiSelectionEffectHostComponent],
      providers: [
        { provide: ManuscriptStore, useValue: { editor: signal({}) } },
        {
          provide: WorkspaceStore,
          useValue: { bookId: signal('book-1'), bookTitle: signal('Book One') },
        },
        {
          provide: AiSelectionEditService,
          useValue: { sessions: signal([]), startEdit, getSession: vi.fn(() => null) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AiSelectionEffectHostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('delegates new edits to the in-memory service', () => {
    expect(component.startEdit(request)).toBe(true);
    expect(startEdit).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      request,
    }));
  });

  it('reports a rejected scene lock without creating a visual effect', () => {
    startEdit.mockReturnValue(null);
    expect(component.startEdit(request)).toBe(false);
    expect(component.hasActiveEdits()).toBe(false);
  });

  it('focuses the visual effect for the requested service session', () => {
    const focusSession = vi.fn(() => true);
    (component as any).effects.set('selection-1', {
      instance: { focusSession },
    } as unknown as ComponentRef<AiSelectionEffectComponent>);

    expect(component.focusSession('selection-1')).toBe(true);
    expect(focusSession).toHaveBeenCalledWith('selection-1');
  });
});
