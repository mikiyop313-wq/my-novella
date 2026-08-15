import {
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  Input,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

type OverlayMenuData = Record<string, unknown>;
type OverlayMenuContext = OverlayMenuData & {
  $implicit: () => void;
  closeMenu: () => void;
};

@Directive({
  selector: '[appOverlayMenu]',
  exportAs: 'appOverlayMenu',
})
export class OverlayMenuDirective implements OnDestroy {
  @Input('appOverlayMenu') menuTemplate!: TemplateRef<OverlayMenuContext>;
  @Input() appOverlayMenuData: OverlayMenuData = {};
  @Input() appOverlayMenuCloseOnSelect = false;
  @Input() appOverlayMenuFocusOnOpen = false;

  private overlayRef?: OverlayRef;
  private closeTimer?: ReturnType<typeof setTimeout>;
  public isClosed = true;

  @HostBinding('attr.aria-haspopup') readonly ariaHasPopup = 'menu';
  @HostBinding('attr.aria-expanded')
  get ariaExpanded(): 'true' | 'false' {
    return this.isClosed ? 'false' : 'true';
  }

  constructor(
    private readonly overlay: Overlay,
    private readonly viewContainerRef: ViewContainerRef,
    private readonly elementRef: ElementRef<HTMLElement>,
  ) {}

  @HostListener('click')
  openMenu(): void {
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      return;
    }

    this.clearCloseTimer();
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions([
        {
          originX: 'start',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
          offsetY: 8,
        },
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'bottom',
          offsetY: -8,
        },
        {
          originX: 'end',
          originY: 'bottom',
          overlayX: 'end',
          overlayY: 'top',
          offsetY: 8,
        },
        {
          originX: 'end',
          originY: 'top',
          overlayX: 'end',
          overlayY: 'bottom',
          offsetY: -8,
        },
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      disposeOnNavigation: true,
    });

    this.overlayRef.backdropClick().subscribe(() => this.closeMenu());
    this.overlayRef.keydownEvents().subscribe((event) => this.handleMenuKeydown(event));

    const closeMenu = () => this.closeMenu();
    const portal = new TemplatePortal(this.menuTemplate, this.viewContainerRef, {
      ...this.appOverlayMenuData,
      $implicit: closeMenu,
      closeMenu,
    });

    this.overlayRef.attach(portal);
    this.isClosed = false;
    this.prepareMenu();
  }

  @HostListener('keydown', ['$event'])
  handleTriggerKeydown(event: KeyboardEvent): void {
    if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;

    event.preventDefault();
    this.openMenu();
    this.focusFirstItem();
  }

  closeMenu(): void {
    if (!this.overlayRef || this.isClosed) return;

    this.isClosed = true;
    const menuElement = this.getMenuElement();
    if (!menuElement) {
      this.destroyOverlay();
      return;
    }

    menuElement.classList.add('is-closed');
    this.closeTimer = setTimeout(() => this.destroyOverlay(), 200);
    this.elementRef.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.clearCloseTimer();
    this.destroyOverlay();
  }

  private prepareMenu(): void {
    const menuElement = this.getMenuElement();
    if (!menuElement || !this.overlayRef) return;

    menuElement.setAttribute('role', 'menu');
    for (const item of this.getMenuItems()) {
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
    }

    this.overlayRef.overlayElement.addEventListener('click', this.handleOverlayClick);
    if (this.appOverlayMenuFocusOnOpen) {
      this.focusFirstItem();
    }
  }

  private readonly handleOverlayClick = (event: Event): void => {
    if (!this.appOverlayMenuCloseOnSelect) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const item = target.closest<HTMLElement>('[role="menuitem"], .menu-item');
    if (!item || item.matches(':disabled, [aria-disabled="true"]')) return;
    this.closeMenu();
  };

  private handleMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu();
      return;
    }

    const items = this.getMenuItems().filter(
      (item) => !item.matches(':disabled, [aria-disabled="true"]'),
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex =
        currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex].focus();
  }

  private focusFirstItem(): void {
    queueMicrotask(() => {
      const firstItem = this.getMenuItems().find(
        (item) => !item.matches(':disabled, [aria-disabled="true"]'),
      );
      firstItem?.focus();
    });
  }

  private getMenuElement(): HTMLElement | null {
    return this.overlayRef?.overlayElement.querySelector<HTMLElement>('.overlay-menu') ?? null;
  }

  private getMenuItems(): HTMLElement[] {
    const menuElement = this.getMenuElement();
    if (!menuElement) return [];
    return [...menuElement.querySelectorAll<HTMLElement>('[role="menuitem"], .menu-item')];
  }

  private clearCloseTimer(): void {
    if (!this.closeTimer) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
  }

  private destroyOverlay(): void {
    if (this.overlayRef) {
      this.overlayRef.overlayElement.removeEventListener('click', this.handleOverlayClick);
      this.overlayRef.dispose();
      this.overlayRef = undefined;
      this.isClosed = true;
    }
  }
}
