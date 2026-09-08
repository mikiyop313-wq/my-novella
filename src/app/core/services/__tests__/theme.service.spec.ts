import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeService, type Theme } from '../theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem('app-theme');
    document.documentElement.classList.remove('dark-theme', 'cream-theme');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.removeItem('app-theme');
    document.documentElement.classList.remove('dark-theme', 'cream-theme');
    vi.unstubAllGlobals();
  });

  it('persists Cream and restores it when the service is recreated', () => {
    TestBed.inject(ThemeService).setTheme('cream');
    expect(localStorage.getItem('app-theme')).toBe('cream');

    TestBed.resetTestingModule();
    document.documentElement.classList.remove('cream-theme');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));

    expect(TestBed.inject(ThemeService).currentTheme()).toBe('cream');
    expect(document.documentElement.classList.contains('cream-theme')).toBe(true);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
  });

  it('clears conflicting classes when switching between all themes', () => {
    const service = TestBed.inject(ThemeService);
    const themes: Theme[] = ['light', 'dark', 'cream'];

    for (const previous of themes) {
      for (const next of themes) {
        service.setTheme(previous);
        service.setTheme(next);
        expect(service.currentTheme()).toBe(next);
        expect(document.documentElement.classList.contains('cream-theme')).toBe(next === 'cream');
        expect(document.documentElement.classList.contains('dark-theme')).toBe(next === 'dark');
      }
    }
  });

  it('preserves the startup default and existing toggle behavior', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.currentTheme()).toBe('light');
    service.toggleTheme();
    expect(service.currentTheme()).toBe('dark');
    service.toggleTheme();
    expect(service.currentTheme()).toBe('light');
    service.setTheme('cream');
    service.toggleTheme();
    expect(service.currentTheme()).toBe('light');
  });

  it('uses the system dark preference without a saved theme', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    expect(TestBed.inject(ThemeService).currentTheme()).toBe('dark');
  });
});
