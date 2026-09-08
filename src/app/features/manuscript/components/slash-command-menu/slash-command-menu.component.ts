import { Component, ElementRef, HostListener, computed, input, output } from '@angular/core';

import type {
  SlashCommand,
  SlashCommandMenuAnchor,
} from '../../extensions/slash-command-menu.extension';

export type SlashCommandMenuPlacement = 'above' | 'below';

export interface SlashCommandMenuPosition {
  left: number;
  top: number;
  maxHeight: number;
  placement: SlashCommandMenuPlacement;
}

interface Dimensions {
  width: number;
  height: number;
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
    '[style.--slash-command-menu-max-height.px]': 'position().maxHeight',
    '[class.placed-above]': "position().placement === 'above'",
  },
})
export class SlashCommandMenuComponent {
  readonly position = input.required<SlashCommandMenuPosition>();
  readonly selectedIndex = input.required<number>();
  readonly items = input<readonly SlashCommandMenuItem[]>(SLASH_COMMAND_MENU_ITEMS);
  readonly commandSelected = output<SlashCommand>();
  readonly dismissed = output<void>();

  readonly aiItem = computed(() => this.items().find(item => item.command === 'ai'));
  readonly structureItems = computed(() => this.items().filter(item => item.command !== 'ai'));

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  select(command: SlashCommand): void {
    this.commandSelected.emit(command);
  }

  preventEditorBlur(event: MouseEvent): void {
    event.preventDefault();
  }

  measure(): Dimensions {
    const menu = this.elementRef.nativeElement.firstElementChild as HTMLElement;
    return {
      width: menu.offsetWidth,
      height: menu.scrollHeight,
    };
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.dismissed.emit();
    }
  }
}

export function positionSlashCommandMenu({
  anchor,
  menu,
  viewport,
}: {
  anchor: SlashCommandMenuAnchor;
  menu: Dimensions;
  viewport: Dimensions;
}): SlashCommandMenuPosition {
  const viewportPadding = 12;
  const menuGap = 8;
  const lineIsOutsideViewport = anchor.bottom < 0 || anchor.top > viewport.height;
  const availableBelow = viewport.height - viewportPadding - anchor.bottom - menuGap;
  const availableAbove = anchor.top - viewportPadding - menuGap;
  const placeAbove =
    !lineIsOutsideViewport &&
    menu.height > availableBelow &&
    availableAbove > availableBelow;
  const placement: SlashCommandMenuPlacement = placeAbove ? 'above' : 'below';
  const availableHeight = placement === 'below' ? availableBelow : availableAbove;
  const maxHeight = lineIsOutsideViewport
    ? Math.max(0, viewport.height - viewportPadding * 2)
    : Math.max(0, availableHeight);
  const left = Math.min(
    Math.max(viewportPadding, anchor.left),
    Math.max(viewportPadding, viewport.width - menu.width - viewportPadding),
  );

  return {
    left,
    top: placement === 'below' ? anchor.bottom + menuGap : anchor.top - menuGap,
    maxHeight,
    placement,
  };
}
