import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Manuscript } from './manuscript';

describe('Manuscript', () => {
  let component: Manuscript;
  let fixture: ComponentFixture<Manuscript>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Manuscript],
    }).compileComponents();

    fixture = TestBed.createComponent(Manuscript);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
