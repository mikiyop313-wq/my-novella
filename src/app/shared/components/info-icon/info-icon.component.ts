import { Component, Input, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverlayInfoDirective } from '../../directives/overlay-info.directive';

@Component({
  selector: 'app-info-icon',
  standalone: true,
  imports: [CommonModule, OverlayInfoDirective],
  templateUrl: './info-icon.component.html',
  styleUrl: './info-icon.component.scss'
})
export class InfoIconComponent {
  @Input() infoText?: string;
  @Input() infoTemplate?: TemplateRef<any>;
  @Input() size: number = 18;
  @Input() color: string = 'currentColor';
}
