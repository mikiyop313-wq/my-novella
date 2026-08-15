import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmModalComponent } from '../confirm-modal.component';
import { ConfirmModalService } from '../confirm-modal.service';

describe('ConfirmModalComponent', () => {
  let fixture: ComponentFixture<ConfirmModalComponent>;
  let service: ConfirmModalService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmModalComponent);
    service = TestBed.inject(ConfirmModalService);
    fixture.detectChanges();
  });

  it('preserves the default Delete action without a checkbox', () => {
    service.open('Delete item?', 'This cannot be undone.', vi.fn());
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.btn-confirm')?.textContent).toContain('Delete');
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('renders custom options and passes the checked value to confirmation', () => {
    const onConfirm = vi.fn();
    service.open('Uninstall?', 'Remove the model.', onConfirm, undefined, {
      confirmLabel: 'Uninstall',
      checkboxLabel: 'Also delete vectors.',
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(element.querySelector('.btn-confirm')?.textContent).toContain('Uninstall');
    expect(element.querySelector('.confirm-modal-checkbox')?.textContent).toContain(
      'Also delete vectors.',
    );
    expect(checkbox?.checked).toBe(false);

    if (!checkbox) throw new Error('Expected confirmation checkbox.');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.btn-confirm')?.click();

    expect(onConfirm).toHaveBeenCalledWith(true);
    expect(service.state().show).toBe(false);
  });

  it('cancels without confirming', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    service.open('Uninstall?', 'Remove the model.', onConfirm, onCancel, {
      checkboxLabel: 'Also delete vectors.',
    });
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.btn-cancel')?.click();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(service.state().show).toBe(false);
  });

  it('resets the checkbox whenever the modal opens', () => {
    service.open('First', 'First message.', vi.fn(), undefined, {
      checkboxLabel: 'Also delete vectors.',
    });
    service.setCheckboxChecked(true);
    service.close();

    service.open('Second', 'Second message.', vi.fn(), undefined, {
      checkboxLabel: 'Also delete vectors.',
    });

    expect(service.state().checkboxChecked).toBe(false);
  });
});
