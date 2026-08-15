import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { Library } from './library';

describe('Library', () => {
  let component: Library;
  let fixture: ComponentFixture<Library>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    navigate = vi.fn();
    await TestBed.configureTestingModule({
      imports: [Library],
      providers: [{ provide: Router, useValue: { navigate } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Library);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens general settings from the top-right button', () => {
    const button = fixture.nativeElement.querySelector(
      '.library-settings-button',
    ) as HTMLButtonElement;

    button.click();

    expect(button.getAttribute('aria-label')).toBe('Open general settings');
    expect(navigate).toHaveBeenCalledWith(['/settings']);
  });
});
