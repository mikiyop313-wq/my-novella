import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ManuscriptStore } from '../../store/manuscript.store';
import { inject } from '@angular/core';

@Component({
  selector: 'app-manuscript-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manuscript-header.component.html',
  styleUrl: './manuscript-header.component.scss'
})
export class ManuscriptHeaderComponent extends AngularNodeViewComponent implements OnInit {
  headerType = signal<'act' | 'chapter'>('act');
  title = signal<string>('');
  position = signal<number>(0);
  entityId = signal<string>('');
  
  store = inject(ManuscriptStore);
  private titleUpdateSubject = new Subject<string>();

  ngOnInit(): void {
    const attrs = this.node()?.attrs;
    if (attrs) {
      this.headerType.set(this.node().type.name === 'actHeader' ? 'act' : 'chapter');
      this.title.set(attrs['title'] || '');
      this.position.set(attrs['position'] || 0);
      const id = attrs['id'] || `temp-${Math.random().toString(36).substr(2, 9)}`;
      this.entityId.set(id);
      if (!attrs['id']) {
        this.updateAttributes()({ id });
      }
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
    this.title.set(newTitle);
    this.updateAttributes()({ title: newTitle });
    
    this.titleUpdateSubject.next(newTitle);
  }
}
