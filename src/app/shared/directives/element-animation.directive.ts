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

interface DeleteAndReflowAnimation {
  target: ElementAnimationTargetSource;
  layoutTargets: ElementAnimationTargetSource;
  action: AnimationAction;
}

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

  async animateBeforeDeleteAndReflow({
    target,
    layoutTargets,
    action,
  }: DeleteAndReflowAnimation): Promise<void> {
    const elements = this.resolveElements(target);

    if (this.prefersReducedMotion() || elements.length === 0) {
      await action();
      return;
    }

    this.addClass(elements, this.appElementAnimationLeaveClass);
    await this.waitForMotion();

    const previousPositions = new Map(
      this.resolveElements(layoutTargets).map(element => [element, element.getBoundingClientRect()]),
    );

    try {
      await action();
      await this.waitForRender();
      await this.animateReflow(previousPositions, this.resolveElements(layoutTargets));
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

  private async animateReflow(
    previousPositions: ReadonlyMap<HTMLElement, DOMRect>,
    elements: readonly HTMLElement[],
  ): Promise<void> {
    const animations = elements.flatMap(element => {
      const previousPosition = previousPositions.get(element);
      if (!previousPosition) return [];

      const currentPosition = element.getBoundingClientRect();
      const offsetX = previousPosition.left - currentPosition.left;
      const offsetY = previousPosition.top - currentPosition.top;
      if (offsetX === 0 && offsetY === 0) return [];

      const animation = element.animate(
        [
          { transform: `translate(${offsetX}px, ${offsetY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: this.appElementAnimationDurationMs,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );

      return [animation.finished.catch(() => undefined)];
    });

    await Promise.all(animations);
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
