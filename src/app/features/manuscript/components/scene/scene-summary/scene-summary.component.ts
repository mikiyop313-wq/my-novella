import { Component, OnInit, signal, ViewChild, ElementRef, AfterViewInit, OnDestroy, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkMenuModule } from '@angular/cdk/menu';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import type { TiptapJsonDoc } from '../../../../../../../shared/models/manuscript.model';
import { AiGenerationSessionService } from '../../../../../core/services/ai-generation-session.service';
import { ElectronService } from '../../../../../core/services/electron.service';
import { MarkdownEditorComponent } from '../../../../../shared/components/markdown-editor/markdown-editor.component';
import { ToastService } from '../../../../../shared/services/toast.service';
import { buildAiPrompt } from '../../../../../shared/utils/ai-prompt-builder';
import { serializeTiptapDocument } from '../../../../../shared/utils/story-context-builder';
import { ManuscriptStore } from '../../../store/manuscript.store';

@Component({
  selector: 'app-scene-summary',
  standalone: true,
  imports: [CommonModule, CdkMenuModule, MarkdownEditorComponent],
  templateUrl: './scene-summary.component.html',
  styleUrl: './scene-summary.component.scss'
})
export class SceneSummaryComponent extends AngularNodeViewComponent implements OnInit, AfterViewInit, OnDestroy {
  store = inject(ManuscriptStore);
  private ngZone = inject(NgZone);
  private elementRef = inject(ElementRef);
  private electronService = inject(ElectronService);
  private generationSessions = inject(AiGenerationSessionService);
  private toastService = inject(ToastService);

  title = signal<string>('');
  summary = signal<string>('');
  entityId = signal<string>('');
  showDivisor = signal<boolean>(false);
  isGeneratingSummary = signal(false);

  @ViewChild('titleEditableDiv') titleEditableDiv!: ElementRef<HTMLDivElement>;

  private scrollContainer: HTMLElement | null = null;
  private scrollListener: any;
  private resizeListener: any;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;
  private titleUpdateSubject = new Subject<string>();
  private summaryUpdateSubject = new Subject<string>();

  ngOnInit(): void {
    const attrs = this.node()?.attrs;
    if (attrs) {
      this.title.set(attrs['title'] || '');
      this.summary.set(attrs['summary'] || '');
      const id = attrs['id'] || `temp-${Math.random().toString(36).substr(2, 9)}`;
      this.entityId.set(id);
      if (!attrs['id']) {
        this.updateAttributes()({ id });
      }
    }

    this.titleUpdateSubject.pipe(debounceTime(500)).subscribe(newTitle => {
      this.store.updateScene({ id: this.entityId(), title: newTitle });
    });

    this.summaryUpdateSubject.pipe(debounceTime(500)).subscribe(newSummary => {
      this.store.updateScene({ id: this.entityId(), summary: newSummary });
    });
  }

  ngAfterViewInit(): void {
    if (this.titleEditableDiv) {
      this.titleEditableDiv.nativeElement.innerText = this.title();
      if (!this.title().trim()) {
        this.titleEditableDiv.nativeElement.innerHTML = '';
      }
    }

    this.setupDynamicLayout();
  }

  private setupDynamicLayout(): void {
    this.scrollContainer = this.elementRef.nativeElement.closest('.editor-content-wrapper');
    if (this.scrollContainer) {
      this.ngZone.runOutsideAngular(() => {
        this.scrollListener = () => this.scheduleLayoutUpdate();
        this.resizeListener = () => this.scheduleLayoutUpdate();

        this.scrollContainer!.addEventListener('scroll', this.scrollListener, { passive: true });
        window.addEventListener('resize', this.resizeListener, { passive: true });

        // Observe changes to the editor content (e.g. typing) to recalculate scene heights
        const tiptapEl = this.scrollContainer!.querySelector('.tiptap');
        if (tiptapEl) {
          this.resizeObserver = new ResizeObserver(() => this.scheduleLayoutUpdate());
          this.resizeObserver.observe(tiptapEl);
        }

        // Initial positioning
        this.scheduleLayoutUpdate();
      });
    }
  }

  private scheduleLayoutUpdate(): void {
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(() => {
        this.updateLayout();
        this.animationFrameId = null;
      });
    }
  }

  ngOnDestroy(): void {
    if (this.scrollContainer && this.scrollListener) {
      this.scrollContainer.removeEventListener('scroll', this.scrollListener);
    }
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  updateLayout(): void {
    if (window.innerWidth < 1400) {
      const gutterNode = this.elementRef.nativeElement.querySelector('.scene-summary-gutter-node') as HTMLElement;
      if (gutterNode) {
        gutterNode.style.transform = 'none';
        gutterNode.style.maxHeight = '';
      }
      return;
    }

    const hostEl = this.elementRef.nativeElement as HTMLElement;
    const gutterNode = hostEl.querySelector('.scene-summary-gutter-node') as HTMLElement;

    if (!hostEl || !gutterNode || !this.scrollContainer) return;

    // --- 0. Determine if divisor should be shown ---
    if (this.editor && typeof this.getPos === 'function') {
      const pos = this.getPos()();
      let currentIsFirst = true;

      this.editor().state.doc.nodesBetween(0, pos!, (node) => {
        if (node.type.name === 'sceneSummary') {
          currentIsFirst = false;
        } else if (node.type.name === 'chapterHeader' || node.type.name === 'actHeader') {
          currentIsFirst = true;
        }
      });

      if (this.showDivisor() === currentIsFirst) {
        this.ngZone.run(() => {
          this.showDivisor.set(!currentIsFirst);
        });
      }
    }

    // --- 1. Calculate and set max-height based on scene height ---
    const allBoundaries = Array.from(this.scrollContainer.querySelectorAll('app-scene-summary, app-manuscript-header'));
    const currentIndex = allBoundaries.indexOf(hostEl);
    const nextBoundary = allBoundaries[currentIndex + 1] as HTMLElement;

    const hostRect = hostEl.getBoundingClientRect();
    let distanceToNext = 0;

    if (nextBoundary) {
      const nextRect = nextBoundary.getBoundingClientRect();
      distanceToNext = nextRect.top - hostRect.top;
    } else {
      // If it's the last boundary, distance is to the bottom of the document
      const tiptapEl = this.scrollContainer.querySelector('.tiptap') as HTMLElement;
      const docBottom = tiptapEl ? tiptapEl.getBoundingClientRect().bottom : this.scrollContainer.getBoundingClientRect().bottom;
      distanceToNext = docBottom - hostRect.top;
    }

    const GAP = 20;

    // Ensure at least 50px so it doesn't completely disappear
    const sceneHeight = Math.max(50, distanceToNext - GAP);
    const viewportMaxHeight = window.innerHeight - 200; // Match CSS calc(100vh - 200px)
    const finalMaxHeight = Math.min(sceneHeight, viewportMaxHeight);

    // Apply max height to allow overflow-y: auto to kick in
    gutterNode.style.maxHeight = `${finalMaxHeight}px`;

    // --- 2. Calculate sticky translateY ---
    const containerRect = this.scrollContainer.getBoundingClientRect();
    const stickOffset = 20;
    const stickTop = containerRect.top + stickOffset;

    let translateY = 0;

    if (hostRect.top < stickTop) {
      translateY = stickTop - hostRect.top;

      if (nextBoundary) {
        const nextRect = nextBoundary.getBoundingClientRect();
        // Use offsetHeight which reflects the dynamically applied max-height limit
        const maxTranslateY = nextRect.top - hostRect.top - gutterNode.offsetHeight - GAP;

        if (translateY > maxTranslateY) {
          translateY = Math.max(0, maxTranslateY);
        }
      }

      // Ensure we don't translate past the bottom of the editor container
      const maxContainerTranslateY = containerRect.bottom - hostRect.top - gutterNode.offsetHeight - GAP;
      if (translateY > maxContainerTranslateY) {
        translateY = Math.max(0, maxContainerTranslateY);
      }
    }

    gutterNode.style.transform = `translateY(${translateY}px)`;
  }

  onSummaryChange(value: string): void {
    const newSummary = value.trim() ? value : '';
    this.summary.set(newSummary);
    this.updateAttributes()({ summary: newSummary });
    this.summaryUpdateSubject.next(newSummary);
  }

  onTitleInput(event: Event): void {
    const target = event.target as HTMLDivElement;
    let newTitle = target.innerText;

    if (!newTitle.trim()) {
      target.innerHTML = '';
      newTitle = '';
    }

    this.title.set(newTitle);
    this.updateAttributes()({ title: newTitle });
    this.titleUpdateSubject.next(newTitle);
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }

  async generateAiSummary(): Promise<void> {
    if (this.isAiSummaryDisabled()) return;

    const sceneId = this.entityId();
    const bookId = this.store.bookHierarchy()[0]?.bookId || this.store.bookId();
    if (!bookId) {
      this.toastService.error('The current book could not be identified.', 'Scene Summary');
      return;
    }

    const streamId = `manuscript-scene-summary:${sceneId}`;
    this.isGeneratingSummary.set(true);

    try {
      const proseBySceneId = await this.electronService.invoke(
        'manuscript:getScenesProse',
        { sceneIds: [sceneId] },
      ) as Record<string, TiptapJsonDoc | null>;
      const prose = serializeTiptapDocument(proseBySceneId[sceneId] ?? null);

      if (!prose) {
        this.toastService.error('Add scene prose before generating a summary.', 'Scene Summary');
        return;
      }

      const session = this.generationSessions.start({
        streamId,
        source: 'outline-summary',
        scopeId: sceneId,
        bookId,
        aiPrompt: buildAiPrompt({
          requestType: 'summary',
          messages: [{
            role: 'user',
            parts: [{ type: 'section', name: 'SCENE PROSE', content: prose }],
          }],
        }),
      });
      if (!session) return;

      const result = await session.completion;
      if (result.status === 'failed') {
        throw result.error ?? new Error('Failed to generate scene summary.');
      }

      const summary = result.content.trim();
      if (!summary) {
        this.toastService.error('AI returned an empty scene summary.', 'Scene Summary');
        return;
      }

      this.summary.set(summary);
      this.updateAttributes()({ summary });
      await this.store.updateScene({ id: sceneId, summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate scene summary.';
      this.toastService.error(message, 'Scene Summary');
    } finally {
      this.generationSessions.release(streamId);
      this.isGeneratingSummary.set(false);
    }
  }

  async archiveScene(): Promise<void> {
    try {
      await this.store.archiveScene(this.entityId());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to archive scene.';
      this.toastService.error(message, 'Manuscript');
    }
  }

  deleteScene(): void {
    this.store.deleteScene(this.entityId());
  }

  isAiSummaryDisabled(): boolean {
    return this.isGeneratingSummary() || !this.hasSceneProse();
  }

  hasSceneProse(): boolean {
    const sceneId = this.entityId();
    let isInsideScene = false;
    let hasEditorProse = false;

    this.store.editor()?.state.doc.forEach(node => {
      const isStructuralBoundary = node.type.name === 'sceneSummary'
        || node.type.name === 'chapterHeader'
        || node.type.name === 'actHeader';

      if (node.type.name === 'sceneSummary' && node.attrs['id'] === sceneId) {
        isInsideScene = true;
      } else if (isInsideScene && isStructuralBoundary) {
        isInsideScene = false;
      } else if (isInsideScene && node.textContent.trim().length > 0) {
        hasEditorProse = true;
      }
    });

    if (hasEditorProse) return true;

    return this.store.bookHierarchy().some(act =>
      act.chapters?.some(chapter =>
        chapter.scenes?.some(scene => scene.id === sceneId && (scene.wordCount ?? 0) > 0),
      ),
    );
  }
}
