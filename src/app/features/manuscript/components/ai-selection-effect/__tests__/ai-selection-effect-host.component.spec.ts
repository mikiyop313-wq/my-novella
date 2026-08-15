import { EventEmitter, type ComponentRef, type ViewContainerRef } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { AiSelectionEffectHostComponent } from '../ai-selection-effect-host.component';
import {
  AiSelectionEffectComponent,
  type AiSelectionEditRequest,
} from '../ai-selection-effect.component';

const request: AiSelectionEditRequest = {
  category: 'rephrase',
  instruction: 'Rephrase the marked passage.',
  actionLabel: 'Rephrase',
};

describe('AiSelectionEffectHostComponent', () => {
  it('owns multiple independent effects and removes only the dismissed one', () => {
    const first = createEffectRef(true);
    const second = createEffectRef(true);
    const pendingEffects = [first, second];
    const host = new AiSelectionEffectHostComponent();
    (host as any).effectContainer = {
      createComponent: vi.fn(() => pendingEffects.shift()),
    } as unknown as ViewContainerRef;

    expect(host.startEdit(request)).toBe(true);
    expect(host.startEdit(request)).toBe(true);
    expect(host.activeEditCount()).toBe(2);

    first.instance.dismissed.emit();

    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.destroy).not.toHaveBeenCalled();
    expect(host.activeEditCount()).toBe(1);
  });

  it('destroys an effect that cannot acquire its scene', () => {
    const rejected = createEffectRef(false);
    const host = new AiSelectionEffectHostComponent();
    (host as any).effectContainer = {
      createComponent: vi.fn(() => rejected),
    } as unknown as ViewContainerRef;

    expect(host.startEdit(request)).toBe(false);
    expect(rejected.destroy).toHaveBeenCalledOnce();
    expect(host.hasActiveEdits()).toBe(false);
  });
});

function createEffectRef(starts: boolean): ComponentRef<AiSelectionEffectComponent> {
  const instance = {
    startEdit: vi.fn(() => starts),
    dismissed: new EventEmitter<void>(),
  } as unknown as AiSelectionEffectComponent;

  return {
    instance,
    changeDetectorRef: { detectChanges: vi.fn() },
    destroy: vi.fn(),
  } as unknown as ComponentRef<AiSelectionEffectComponent>;
}
