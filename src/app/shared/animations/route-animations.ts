import {
  trigger,
  transition,
  style,
  query,
  animate,
  group,
  animateChild
} from '@angular/animations';

export const routeAnimations =
  trigger('routeAnimations', [
    transition('* => SettingsPage', [
      style({ position: 'relative' }),
      query(':leave', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        })
      ], { optional: true }),
      query(':enter', [
        style({
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 2000,
          transform: 'translateY(-100%)'
        })
      ], { optional: true }),
      query(':enter', [
        animate(
          '500ms cubic-bezier(0.22, 1, 0.36, 1)',
          style({ transform: 'translateY(0%)' })
        )
      ], { optional: true })
    ]),
    transition('SettingsPage => *', [
      style({ position: 'relative' }),
      query(':enter', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        })
      ], { optional: true }),
      query(':leave', [
        style({
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 2000,
          transform: 'translateY(0%)'
        }),
        animate(
          '500ms cubic-bezier(0.22, 1, 0.36, 1)',
          style({ transform: 'translateY(-100%)' })
        )
      ], { optional: true })
    ]),
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
          animate('1200ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateY(-100%)', opacity: 0 }))
        ]),
        query(':enter', [
          animate('1200ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateY(0%)', opacity: 1 }))
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
    ]),
    transition('OutlinePage => ManuscriptPage, OutlinePage => ChatPage, ManuscriptPage => ChatPage', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('800ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(-100%)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('800ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(0%)', opacity: 1 }))
        ], { optional: true })
      ]),
    ]),
    transition('ManuscriptPage => OutlinePage, ChatPage => ManuscriptPage, ChatPage => OutlinePage', [
      style({ position: 'relative' }),
      query(':enter, :leave', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        })
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateX(-100%)', opacity: 0 })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('800ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(100%)', opacity: 0 }))
        ], { optional: true }),
        query(':enter', [
          animate('800ms cubic-bezier(0.35, 0, 0.25, 1)', style({ transform: 'translateX(0%)', opacity: 1 }))
        ], { optional: true })
      ]),
    ]),
    transition('LibraryPage => WorkspacePage', [
      style({ position: 'relative' }),
      query(':leave', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        })
      ], { optional: true }),
      query(':enter', [
        style({
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 10,
          clipPath: 'circle(0% at 50% 50%)'
        })
      ], { optional: true }),
      group([
        query(':enter', [
          animate('600ms cubic-bezier(0.25, 1, 0.5, 1)', style({ clipPath: 'circle(150% at 50% 50%)' }))
        ], { optional: true })
      ])
    ]),
    transition('WorkspacePage => LibraryPage', [
      style({ position: 'relative' }),
      query(':enter', [
        style({
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        })
      ], { optional: true }),
      query(':leave', [
        style({
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 10,
          clipPath: 'circle(150% at 50% 50%)'
        })
      ], { optional: true }),
      group([
        query(':leave', [
          animate('600ms cubic-bezier(0.25, 1, 0.5, 1)', style({ clipPath: 'circle(0% at 50% 50%)' }))
        ], { optional: true }),
        query(':leave @*', [
          animateChild()
        ], { optional: true })
      ])
    ]),
    transition('OutlinePage => *', [
      query(':leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }),
        animate('600ms', style({ opacity: 1 }))
      ], { optional: true })
    ]),
    transition('ManuscriptPage => *', [
      query(':leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }),
        animate('600ms', style({ opacity: 1 }))
      ], { optional: true })
    ]),
    transition('ChatPage => *', [
      query(':leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }),
        animate('600ms', style({ opacity: 1 }))
      ], { optional: true })
    ])
  ]);
