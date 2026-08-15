import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';

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

  ngOnInit(): void {
    const attrs = this.node()?.attrs;
    if (attrs) {
      this.headerType.set(this.node().type.name === 'actHeader' ? 'act' : 'chapter');
      this.title.set(attrs['title'] || '');
      this.position.set(attrs['position'] || 0);
      this.entityId.set(attrs['id'] || '');
    }
  }

  onTitleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newTitle = target.value;
    this.title.set(newTitle);
    this.updateAttributes()({ title: newTitle });
  }
}
