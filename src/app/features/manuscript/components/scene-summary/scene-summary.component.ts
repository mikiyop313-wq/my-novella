import { Component, OnInit, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularNodeViewComponent } from 'ngx-tiptap';

@Component({
  selector: 'app-scene-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scene-summary.component.html',
  styleUrl: './scene-summary.component.scss'
})
export class SceneSummaryComponent extends AngularNodeViewComponent implements OnInit, AfterViewInit {
  isCollapsed = signal<boolean>(true);
  summary = signal<string>('');
  entityId = signal<string>('');

  @ViewChild('editableDiv') editableDiv!: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    const attrs = this.node()?.attrs;
    if (attrs) {
      this.summary.set(attrs['summary'] || '');
      this.entityId.set(attrs['id'] || '');
    }
  }

  ngAfterViewInit(): void {
    if (this.editableDiv) {
      this.editableDiv.nativeElement.innerText = this.summary();
    }
  }

  toggleCollapse(): void {
    this.isCollapsed.set(!this.isCollapsed());
  }

  onInput(event: Event): void {
    const target = event.target as HTMLDivElement;
    let newSummary = target.innerText;
    
    if (!newSummary.trim()) {
      target.innerHTML = '';
      newSummary = '';
    }
    
    this.summary.set(newSummary);
    this.updateAttributes()({ summary: newSummary });
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }
}
