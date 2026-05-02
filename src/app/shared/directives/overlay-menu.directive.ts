import { Directive, Input, TemplateRef, ViewContainerRef, HostListener, ElementRef } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

@Directive({
  selector: '[appOverlayMenu]',
  exportAs: 'appOverlayMenu'
})
export class OverlayMenuDirective {
  @Input('appOverlayMenu') menuTemplate!: TemplateRef<any>;

  private overlayRef?: OverlayRef;
  public isClosed = true;

  constructor(
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
    private elementRef: ElementRef
  ) { }

  @HostListener('click')
  openMenu() {
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      this.isClosed = false;
      return;
    }

    const positionStrategy = this.overlay.position().flexibleConnectedTo(
      this.elementRef
    ).withPositions([
      { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 16 },
      { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -16 }
    ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop'
    });

    this.overlayRef.backdropClick().subscribe(() => this.closeMenu());

    // Provide the close function as $implicit to the template
    const portal = new TemplatePortal(this.menuTemplate, this.viewContainerRef, {
      $implicit: () => this.closeMenu()
    });

    this.overlayRef.attach(portal);
  }

  closeMenu() {
    if (this.overlayRef) {
      const menuElement = this.overlayRef.overlayElement.querySelector('.overlay-menu');
      if (menuElement) {
        menuElement.classList.add('is-closed');
        setTimeout(() => {
          this.destroyOverlay();
        }, 200); // Wait for the animation to finish
      } else {
        this.destroyOverlay();
      }
    }
  }

  private destroyOverlay() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = undefined;
      this.isClosed = true;
    }
  }
}
