import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';

import { ElectronService } from '../../core/services/electron.service';
import { Manuscript } from './manuscript';

describe('Manuscript', () => {
  let component: Manuscript;
  let fixture: ComponentFixture<Manuscript>;
  const electronServiceMock = {
    invoke: async (channel: string) => {
      if (channel === 'ai:list-models') return [];
      if (channel === 'manuscript:getWordCount') return 0;
      if (channel === 'manuscript:getBookHierarchy') return [];
      if (channel === 'manuscript:get') return [];
      return null;
    },
    onBeforeClose: () => undefined,
    removeBeforeCloseHandler: () => undefined,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Manuscript],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ mode: 'book', id: 'book-1' }),
            parent: {
              snapshot: {
                paramMap: convertToParamMap({ bookId: 'book-1' }),
              },
            },
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: () => Promise.resolve(true),
          },
        },
        {
          provide: ElectronService,
          useValue: electronServiceMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Manuscript);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
