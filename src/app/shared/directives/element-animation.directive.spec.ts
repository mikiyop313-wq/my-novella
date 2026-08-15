import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ElementAnimationDirective } from './element-animation.directive';

@Component({
  standalone: true,
  imports: [ElementAnimationDirective],
  template: `
    <div
      appElementAnimation
      #animation="appElementAnimation"
      appElementAnimationEnterClass="entering"
      appElementAnimationLeaveClass="leaving"
      [appElementAnimationDurationMs]="10">
    </div>
  `,
})
class ElementAnimationHostComponent {
  @ViewChild('animation', { static: true }) animation!: ElementAnimationDirective;
}

describe('ElementAnimationDirective', () => {
  let fixture: ComponentFixture<ElementAnimationHostComponent>;
  let component: ElementAnimationHostComponent;
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => window.setTimeout(() => callback(0), 0));
    originalMatchMedia = window.matchMedia;
    setMatchMedia(false);

    await TestBed.configureTestingModule({
      imports: [ElementAnimationHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ElementAnimationHostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    requestAnimationFrameSpy.mockRestore();
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
    vi.useRealTimers();
  });

  it('adds and removes the enter class after creating an element', async () => {
    const target = document.createElement('div');

    const animation = component.animation.animateAfterCreate(vi.fn(), target);

    await vi.advanceTimersByTimeAsync(0);
    expect(target.classList.contains('entering')).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    await animation;

    expect(target.classList.contains('entering')).toBe(false);
  });

  it('adds the leave class before running the delete action', async () => {
    const target = document.createElement('div');
    const action = vi.fn();

    const animation = component.animation.animateBeforeDelete(target, action);

    expect(target.classList.contains('leaving')).toBe(true);
    expect(action).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    await animation;

    expect(action).toHaveBeenCalledTimes(1);
    expect(target.classList.contains('leaving')).toBe(true);
  });

  it('removes the leave class when delete action fails', async () => {
    const target = document.createElement('div');
    const action = vi.fn().mockRejectedValue(new Error('Delete failed'));

    const animation = component.animation.animateBeforeDelete(target, action);
    const expectedFailure = expect(animation).rejects.toThrow('Delete failed');

    expect(target.classList.contains('leaving')).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    await expectedFailure;

    expect(target.classList.contains('leaving')).toBe(false);
  });

  it('handles arrays of elements', async () => {
    const first = document.createElement('div');
    const second = document.createElement('div');

    const animation = component.animation.animateAfterCreate(vi.fn(), [first, second]);

    await vi.advanceTimersByTimeAsync(0);

    expect(first.classList.contains('entering')).toBe(true);
    expect(second.classList.contains('entering')).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    await animation;

    expect(first.classList.contains('entering')).toBe(false);
    expect(second.classList.contains('entering')).toBe(false);
  });

  it('runs the action when targets are missing', async () => {
    const action = vi.fn();

    await component.animation.animateBeforeDelete(null, action);

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('skips classes and timers when reduced motion is preferred', async () => {
    setMatchMedia(true);
    const target = document.createElement('div');
    const action = vi.fn();

    await component.animation.animateBeforeDelete(target, action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(target.classList.contains('leaving')).toBe(false);
  });
});

const setMatchMedia = (prefersReducedMotion: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && prefersReducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};
