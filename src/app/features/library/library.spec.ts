import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectronService } from '../../core/services/electron.service';
import { ToastService } from '../../shared/services/toast.service';
import { Library } from './library';

describe('Library', () => {
  let component: Library;
  let fixture: ComponentFixture<Library>;
  let navigate: ReturnType<typeof vi.fn>;
  let electronInvoke: ReturnType<typeof vi.fn>;
  let toastSuccess: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    navigate = vi.fn();
    electronInvoke = vi.fn();
    toastSuccess = vi.fn();
    await TestBed.configureTestingModule({
      imports: [Library],
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: ElectronService, useValue: { invoke: electronInvoke } },
        { provide: ToastService, useValue: { success: toastSuccess, error: vi.fn() } },
      ],
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

  it('imports an archive from the button and refreshes the library', async () => {
    electronInvoke.mockResolvedValue({
      status: 'imported',
      importedBookIds: ['book-1'],
    });
    const loadBooks = vi.spyOn(component.libraryStore, 'loadBooks');
    const button = fixture.nativeElement.querySelector(
      '.library-import-button',
    ) as HTMLButtonElement;

    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-label')).toBe('Import a My Novella archive');
    expect(electronInvoke).toHaveBeenCalledWith('data-transfer:import');
    expect(loadBooks).toHaveBeenCalledOnce();
    expect(toastSuccess).toHaveBeenCalledWith('Imported 1 book.');
  });
});
