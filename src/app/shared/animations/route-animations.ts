import {
  trigger,
  transition,
  style,
  query,
  animate,
  group,
} from '@angular/animations';

export const routeAnimations =
  trigger('routeAnimations', [
    transition('LibraryPage => CreatePage', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        })
      ]),
      query(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 })
      ]),
      group([
        query(':leave', [
          animate('600ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateY(-100%)', opacity: 0 }))
        ]),
        query(':enter', [
          animate('600ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateY(0%)', opacity: 1 }))
        ])
      ]),
    ]),
    transition('CreatePage => LibraryPage', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        })
      ]),
      query(':enter', [
        style({ transform: 'translateY(-100%)', opacity: 0 })
      ]),
      group([
        query(':leave', [
          animate('600ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateY(100%)', opacity: 0 }))
        ]),
        query(':enter', [
          animate('600ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateY(0%)', opacity: 1 }))
        ])
      ]),
    ])
  ]);
