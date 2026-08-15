import {
  Directive,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

@Directive({
  selector: '[appOverlayModal]',
  exportAs: 'appOverlayModal'
})
export class OverlayModalDirective implements OnDestroy {
  @Input('appOverlayModal') modalTemplate!: TemplateRef<any>;
  @Output() closed = new EventEmitter<void>();

  private overlayRef?: OverlayRef;
  private isClosing = false;
  private closingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef
  ) { }

  @HostListener('click')
  openModal() {
    if (this.overlayRef && this.overlayRef.hasAttached()) {
      return;
    }

    const positionStrategy = this.overlay.position()
      .global()
      .centerHorizontally()
      .centerVertically();

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.block(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      panelClass: 'overlay-modal-panel'
    });
    this.isClosing = false;

    this.overlayRef.backdropClick().subscribe(() => this.closeModal());

    // Provide the close function as $implicit to the template
    const portal = new TemplatePortal(this.modalTemplate, this.viewContainerRef, {
      $implicit: () => this.closeModal()
    });

    this.overlayRef.attach(portal);
  }

  closeModal() {
    if (this.overlayRef && !this.isClosing) {
      this.isClosing = true;
      // Handle animation if necessary similar to overlay-menu
      const modalElement = this.overlayRef.overlayElement.querySelector('.overlay-modal');
      const backdropElement = this.overlayRef.backdropElement;
      if (modalElement) {
        modalElement.classList.add('is-closed');
        backdropElement?.classList.add('is-closed');
        this.closingTimer = setTimeout(() => {
          this.closingTimer = null;
          this.destroyOverlay();
        }, 200);
      } else {
        this.destroyOverlay();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.closingTimer !== null) clearTimeout(this.closingTimer);
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  private destroyOverlay() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = undefined;
      this.isClosing = false;
      this.closed.emit();
    }
  }
}
