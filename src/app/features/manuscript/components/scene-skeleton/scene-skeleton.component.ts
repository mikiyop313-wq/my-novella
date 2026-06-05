import { Component, OnInit, inject, signal, NgZone, ElementRef, OnDestroy } from '@angular/core';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { ManuscriptStore } from '../../store/manuscript.store';

/**
 * Renders an animated skeleton placeholder for a deferred scene.
 * Displayed inside the Tiptap editor as a `sceneSkeleton` node until the real
 * prose is fetched and patched in by `ManuscriptStore.loadAndPatchScene()`.
 *
 * The component itself carries the `data-scene-id` attribute on its host element
 * so the parent `IntersectionObserver` can identify which scene to load.
 */
@Component({
  selector: 'app-scene-skeleton',
  standalone: true,
  imports: [],
  templateUrl: './scene-skeleton.component.html',
  styleUrl: './scene-skeleton.component.scss',
})
export class SceneSkeletonComponent extends AngularNodeViewComponent implements OnInit, OnDestroy {
  private readonly store = inject(ManuscriptStore);
  private readonly ngZone = inject(NgZone);
  private readonly el = inject(ElementRef<HTMLElement>);

  sceneId = signal<string>('');

  /** Whether this skeleton is currently being fetched. */
  isLoading = signal<boolean>(false);

  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    const id = this.node()?.attrs?.['sceneId'] ?? '';
    this.sceneId.set(id);

    // Expose the scene ID on the host element so the parent component's
    // shared observer can look it up without re-reading node attributes.
    this.el.nativeElement.setAttribute('data-scene-id', id);

    // Set up a local IntersectionObserver for this skeleton node.
    // When it enters the viewport, trigger the prose load.
    this.ngZone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            this.ngZone.run(() => {
              this.isLoading.set(true);
              this.store.loadAndPatchScene(this.sceneId());
            });
            // Once triggered, disconnect — the node will be replaced anyway.
            this.observer?.disconnect();
          }
        },
        { rootMargin: '200px' } // Preload 200px before the skeleton enters view
      );
      this.observer.observe(this.el.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
