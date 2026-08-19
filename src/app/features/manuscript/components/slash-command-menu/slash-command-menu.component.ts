import { Component, ElementRef, HostListener, input, output } from '@angular/core';

import type { SlashCommand } from '../../extensions/slash-command-menu.extension';

export interface SlashCommandMenuPosition {
  left: number;
  top: number;
}

export interface SlashCommandMenuItem {
  command: SlashCommand;
  title: string;
  description: string;
}

export const SLASH_COMMAND_MENU_ITEMS: readonly SlashCommandMenuItem[] = [
  {
    command: 'ai',
    title: 'AI Prose Generation',
    description: 'Generate or continue prose with AI.',
  },
  {
    command: 'act',
    title: 'Create Act',
    description: 'Move the text below the current scene into a new act.',
  },
  {
    command: 'chapter',
    title: 'Create Chapter',
    description: 'Move the text below the current scene into a new chapter.',
  },
  {
    command: 'scene',
    title: 'Create Scene',
    description: 'Move the text below the current scene into a new scene.',
  },
];

@Component({
  selector: 'app-slash-command-menu',
  standalone: true,
  templateUrl: './slash-command-menu.component.html',
  styleUrl: './slash-command-menu.component.scss',
  host: {
    '[style.left.px]': 'position().left',
    '[style.top.px]': 'position().top',
  },
})
export class SlashCommandMenuComponent {
  readonly position = input.required<SlashCommandMenuPosition>();
  readonly selectedIndex = input.required<number>();
  readonly commandSelected = output<SlashCommand>();
  readonly dismissed = output<void>();

  readonly items = SLASH_COMMAND_MENU_ITEMS;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  select(command: SlashCommand): void {
    this.commandSelected.emit(command);
  }

  preventEditorBlur(event: MouseEvent): void {
    event.preventDefault();
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.dismissed.emit();
    }
  }
}
