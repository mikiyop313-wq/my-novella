import { Component, OnInit, OnDestroy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ManuscriptStore } from '../../../store/manuscript.store';

@Component({
  selector: 'app-scene-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scene-header.component.html',
  styleUrl: './scene-header.component.scss'
})
export class SceneHeaderComponent implements OnInit, OnDestroy {
  readonly store = inject(ManuscriptStore);

  /** Resolves the current scene's title from the hierarchy. */
  sceneTitle = computed<string>(() => {
    const id = this.store.sceneId();
    if (!id) return '';
    for (const act of this.store.bookHierarchy()) {
      for (const chapter of act.chapters || []) {
        const scene = (chapter.scenes || []).find(s => s.id === id);
        if (scene) return scene.title ?? '';
      }
    }
    return '';
  });

  private sceneTitleSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.sceneTitleSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(newTitle => {
      const id = this.store.sceneId();
      if (id) this.store.updateScene({ id, title: newTitle });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSceneChange(event: Event): void {
    this.sceneTitleSubject.next((event.target as HTMLInputElement).value);
  }
}
