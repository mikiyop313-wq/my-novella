import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Directive, ElementRef, Input, TemplateRef, ViewContainerRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appOverlayInfoDirective]',
  standalone: true,
  exportAs: 'appOverlayInfoDirective'
})
export class OverlayInfoDirective {

  @Input('appOverlayInfoDirective') infoTemplate!: TemplateRef<any>;

  private overlayRef?: OverlayRef;
  public isClosed = true;

  constructor(

    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
    private elementRef: ElementRef

  ) { }


  @HostListener('click', ['$event'])
  toggleInfo(event: MouseEvent) {
    event.stopPropagation();
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      this.closeInfo();
    } else {
      this.openInfo();
    }
  }

  openInfo() {
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      return;
    }

    const positionStrategy = this.overlay.position().flexibleConnectedTo(this.elementRef).withPositions([
      { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -16 },
      { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 16 },
    ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop'
    });

    this.overlayRef.backdropClick().subscribe(() => this.closeInfo());

    const portal = new TemplatePortal(this.infoTemplate, this.viewContainerRef, {
      $implicit: () => this.closeInfo()
    });

    this.overlayRef.attach(portal);
    this.isClosed = false;
  }

  closeInfo() {
    this.destroyOverlay();
  }

  private destroyOverlay() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = undefined;
      this.isClosed = true;
    }
  }


}
