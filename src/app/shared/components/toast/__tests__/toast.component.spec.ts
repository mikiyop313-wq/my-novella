import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import { ToastComponent } from '../toast.component';

describe('ToastComponent', () => {
  it('runs the optional action and closes the notification', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture: ComponentFixture<ToastComponent> = TestBed.createComponent(ToastComponent);
    const handler = vi.fn();
    const close = vi.fn();
    fixture.componentRef.setInput('toast', {
      type: 'error',
      message: 'Could not refresh the Codex.',
      action: { label: 'Retry', handler },
    });
    fixture.componentInstance.close.subscribe(close);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.toast-action-btn') as HTMLButtonElement).click();

    expect(close).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });
});
