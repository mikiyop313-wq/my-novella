import { Directive, ElementRef, Input } from '@angular/core';

type ViewTransitionHandle = {
  finished: Promise<void>;
  updateCallbackDone?: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => ViewTransitionHandle;
};

type AnimationAction = () => Promise<void> | void;
type ElementAnimationTarget = ElementRef<HTMLElement> | HTMLElement | null | undefined;
type ElementAnimationTargets = ElementAnimationTarget | readonly ElementAnimationTarget[];
type ElementAnimationTargetSource = ElementAnimationTargets | (() => ElementAnimationTargets);

@Directive({
  selector: '[appElementAnimation]',
  exportAs: 'appElementAnimation',
})
export class ElementAnimationDirective {
  @Input() appElementAnimationEnterClass = 'app-animation-entering';
  @Input() appElementAnimationLeaveClass = 'app-animation-leaving';
  @Input() appElementAnimationDurationMs = 260;
  @Input() appElementAnimationUseViewTransition = true;

  async animateAfterCreate(
    action: AnimationAction,
    targets?: ElementAnimationTargetSource,
  ): Promise<void> {
    const transition = await this.startViewTransition(action);

    if (transition) {
      await (transition.updateCallbackDone ?? transition.finished);
    }

    await this.waitForRender();
    await Promise.all([
      this.playClass(targets, this.appElementAnimationEnterClass),
      transition?.finished ?? Promise.resolve(),
    ]);
  }

  async animateBeforeDelete(
    targets: ElementAnimationTargetSource,
    action: AnimationAction,
  ): Promise<void> {
    const elements = this.resolveElements(targets);

    if (this.prefersReducedMotion() || elements.length === 0) {
      await this.runWithViewTransition(action);
      return;
    }

    this.addClass(elements, this.appElementAnimationLeaveClass);
    await this.waitForMotion();

    try {
      await this.runWithViewTransition(action);
    } catch (error) {
      this.removeClass(elements, this.appElementAnimationLeaveClass);
      throw error;
    }
  }

  private async playClass(
    targets: ElementAnimationTargetSource | undefined,
    className: string,
  ): Promise<void> {
    if (this.prefersReducedMotion()) {
      return;
    }

    const elements = this.resolveElements(targets);

    if (elements.length === 0) {
      return;
    }

    this.addClass(elements, className);
    await this.waitForMotion();
    this.removeClass(elements, className);
  }

  private addClass(elements: HTMLElement[], className: string): void {
    for (const element of elements) {
      element.classList.add(className);
    }
  }

  private removeClass(elements: HTMLElement[], className: string): void {
    for (const element of elements) {
      element.classList.remove(className);
    }
  }

  private resolveElements(targets: ElementAnimationTargetSource | undefined): HTMLElement[] {
    const resolvedTargets = typeof targets === 'function' ? targets() : targets;
    const targetList = Array.isArray(resolvedTargets) ? resolvedTargets : [resolvedTargets];

    return targetList
      .map(target => target instanceof ElementRef ? target.nativeElement : target)
      .filter((target): target is HTMLElement => target instanceof HTMLElement);
  }

  private async runWithViewTransition(action: AnimationAction): Promise<void> {
    const transition = await this.startViewTransition(action);
    await (transition?.finished ?? Promise.resolve());
  }

  private async startViewTransition(action: AnimationAction): Promise<ViewTransitionHandle | null> {
    const documentWithViewTransition = document as ViewTransitionDocument;

    if (
      this.prefersReducedMotion()
      || !this.appElementAnimationUseViewTransition
      || !documentWithViewTransition.startViewTransition
    ) {
      await action();
      return null;
    }

    return documentWithViewTransition.startViewTransition(action);
  }

  private waitForRender(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  private waitForMotion(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.appElementAnimationDurationMs));
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
}
