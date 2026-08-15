import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';

import { type ChatThreadDto } from '../../../../../../shared/models/chat.model';
import { ChatThreads } from './chat-threads';

describe('ChatThreads', () => {
  let component: ChatThreads;
  let fixture: ComponentFixture<ChatThreads>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatThreads],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatThreads);
    component = fixture.componentInstance;
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

  it('shows a loader and disables destructive actions for a generating thread', () => {
    const thread: ChatThreadDto = {
      id: 'thread-1',
      bookId: 'book-1',
      title: 'Draft chat',
      status: 'active',
      lastModelId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
    };
    fixture.componentRef.setInput('threads', [thread]);
    fixture.componentRef.setInput('generatingThreadIds', new Set(['thread-1']));
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('.thread-generation-status') as HTMLElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-label')).toBe('Generating response');
    expect(status.nextElementSibling?.classList.contains('thread-menu-btn')).toBe(true);
    expect(status.querySelector('.thread-generation-loader')).not.toBeNull();
    expect(component.getManagementTooltip('thread-1', 'delete')).toContain('generation');

    const archiveRequest = vi.fn();
    const deleteRequest = vi.fn();
    component.archiveThreadRequested.subscribe(archiveRequest);
    component.deleteThreadRequested.subscribe(deleteRequest);
    component.archiveThread('thread-1');
    component.deleteThread('thread-1');

    expect(archiveRequest).not.toHaveBeenCalled();
    expect(deleteRequest).not.toHaveBeenCalled();
  });
});
