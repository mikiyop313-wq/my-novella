import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ChatThreads } from './chat-threads';

describe('ChatThreads', () => {
  let component: ChatThreads;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatThreads],
    }).compileComponents();

    component = TestBed.createComponent(ChatThreads).componentInstance;
  });

  it('does not select a thread from row activation while renaming it', () => {
    const threadSelected = vi.fn();
    const event = new MouseEvent('click', { cancelable: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    component.threadSelected.subscribe(threadSelected);

    component.editingThreadId = 'thread-1';
    component.onThreadClick('thread-1', event);

    expect(threadSelected).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('consumes keyboard rename saves without selecting the row', () => {
    const renameThreadRequested = vi.fn();
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    component.renameThreadRequested.subscribe(renameThreadRequested);

    component.editingThreadId = 'thread-1';
    component.saveRenameFromKeyboard('thread-1', 'New title', 'Draft chat', event);

    expect(renameThreadRequested).toHaveBeenCalledWith({ id: 'thread-1', title: 'New title' });
    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalled();
  });
});
