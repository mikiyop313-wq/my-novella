import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkMenuModule } from '@angular/cdk/menu';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ManuscriptStore } from '../../store/manuscript.store';
import { ToastService } from '../../../../shared/services/toast.service';

@Component({
  selector: 'app-manuscript-header',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkMenuModule],
  templateUrl: './manuscript-header.component.html',
  styleUrl: './manuscript-header.component.scss'
})
export class ManuscriptHeaderComponent extends AngularNodeViewComponent implements OnInit {
  headerType = computed<'act' | 'chapter'>(() => this.node()?.type.name === 'actHeader' ? 'act' : 'chapter');
  title = computed<string>(() => this.node()?.attrs['title'] || '');
  position = computed<number>(() => this.node()?.attrs['position'] || 0);
  entityId = computed<string>(() => this.node()?.attrs['id'] || '');

  store = inject(ManuscriptStore);
  private toastService = inject(ToastService);
  private titleUpdateSubject = new Subject<string>();

  ngOnInit(): void {
    if (!this.entityId()) {
      const id = `temp-${Math.random().toString(36).substr(2, 9)}`;
      this.updateAttributes()({ id });
    }

    this.titleUpdateSubject.pipe(debounceTime(500)).subscribe(newTitle => {
      if (this.headerType() === 'act') {
        this.store.updateAct({ id: this.entityId(), title: newTitle });
      } else {
        this.store.updateChapter({ id: this.entityId(), title: newTitle });
      }
    });
  }

  onTitleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newTitle = target.value;
    this.updateAttributes()({ title: newTitle });

    this.titleUpdateSubject.next(newTitle);
  }

  deleteSection(): void {
    if (this.headerType() === 'act') {
      this.store.deleteAct(this.entityId());
    } else {
      this.store.deleteChapter(this.entityId());
    }
  }

  async archiveSection(): Promise<void> {
    try {
      if (this.headerType() === 'act') {
        await this.store.archiveAct(this.entityId());
      } else {
        await this.store.archiveChapter(this.entityId());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to archive ${this.headerType()}.`;
      this.toastService.error(message, 'Manuscript');
    }
  }
}
