import {
  Component,
  ComponentRef,
  ViewChild,
  ViewContainerRef,
  signal,
} from '@angular/core';

import {
  AiSelectionEffectComponent,
  type AiSelectionEditRequest,
} from './ai-selection-effect.component';

@Component({
  selector: 'app-ai-selection-effect-host',
  standalone: true,
  template: '<ng-template #effectContainer />',
})
export class AiSelectionEffectHostComponent {
  @ViewChild('effectContainer', { read: ViewContainerRef, static: true })
  private effectContainer!: ViewContainerRef;

  readonly activeEditCount = signal(0);
  private readonly effects = new Set<ComponentRef<AiSelectionEffectComponent>>();

  startEdit(request: AiSelectionEditRequest): boolean {
    const effect = this.effectContainer.createComponent(AiSelectionEffectComponent);
    effect.changeDetectorRef.detectChanges();

    if (!effect.instance.startEdit(request)) {
      effect.destroy();
      return false;
    }

    this.effects.add(effect);
    this.activeEditCount.set(this.effects.size);
    effect.instance.dismissed.subscribe(() => this.removeEffect(effect));
    return true;
  }

  hasActiveEdits(): boolean {
    return this.activeEditCount() > 0;
  }

  private removeEffect(effect: ComponentRef<AiSelectionEffectComponent>): void {
    if (!this.effects.delete(effect)) return;

    effect.destroy();
    this.activeEditCount.set(this.effects.size);
  }
}
