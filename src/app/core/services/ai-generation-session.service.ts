import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';

import { ToastService } from '../../shared/services/toast.service';
import { AiStreamRequest, AiStreamService, LoadingStatus } from './ai-stream.service';

export type AiGenerationSessionSource =
  | 'chat-response'
  | 'chat-title'
  | 'manuscript-prose'
  | 'manuscript-selection'
  | 'outline-summary'
  | 'codex-detection';

export type AiGenerationSessionStatus =
  | Exclude<LoadingStatus, 'idle'>
  | 'complete'
  | 'stopped'
  | 'failed';

export interface AiGenerationSessionResult {
  status: 'complete' | 'stopped' | 'failed';
  content: string;
  reasoning: string;
  error: unknown | null;
}

export interface StartAiGenerationSessionRequest
  extends Omit<AiStreamRequest, 'onToken' | 'onReasoningUpdate' | 'onStatusChange'> {
  source: AiGenerationSessionSource;
  scopeId?: string;
  onContentChange?: (content: string) => void;
  onReasoningChange?: (reasoning: string) => void;
  onStatusChange?: (status: AiGenerationSessionStatus) => void;
}

export interface AiGenerationSession {
  id: string;
  source: AiGenerationSessionSource;
  scopeId: string | null;
  status: Signal<AiGenerationSessionStatus>;
  content: Signal<string>;
  reasoning: Signal<string>;
  error: Signal<unknown | null>;
  completion: Promise<AiGenerationSessionResult>;
}

interface ManagedAiGenerationSession extends AiGenerationSession {
  status: WritableSignal<AiGenerationSessionStatus>;
  content: WritableSignal<string>;
  reasoning: WritableSignal<string>;
  error: WritableSignal<unknown | null>;
  stopRequested: boolean;
}

@Injectable({ providedIn: 'root' })
export class AiGenerationSessionService {
  private readonly aiStreamService = inject(AiStreamService);
  private readonly toastService = inject(ToastService);

  private readonly managedSessions = new Map<string, ManagedAiGenerationSession>();
  private readonly sessionsVersion = signal(0);

  sessions(): readonly AiGenerationSession[] {
    this.sessionsVersion();
    return [...this.managedSessions.values()];
  }

  getSession(sessionId: string): AiGenerationSession | null {
    this.sessionsVersion();
    return this.managedSessions.get(sessionId) ?? null;
  }

  hasActiveSession(source?: AiGenerationSessionSource): boolean {
    this.sessionsVersion();
    return [...this.managedSessions.values()].some(session => (
      (source === undefined || session.source === source)
      && !this.isTerminal(session.status())
    ));
  }

  hasActiveScopedSession({
    source,
    scopeId,
  }: {
    source: AiGenerationSessionSource;
    scopeId: string;
  }): boolean {
    this.sessionsVersion();
    return [...this.managedSessions.values()].some(session => (
      session.source === source
      && session.scopeId === scopeId
      && !this.isTerminal(session.status())
    ));
  }

  start(request: StartAiGenerationSessionRequest): AiGenerationSession | null {
    if (this.managedSessions.has(request.streamId)) {
      this.toastService.warning(
        'This AI generation session is already being managed.',
        'AI Generation',
      );
      return null;
    }

    const scopeId = request.scopeId ?? null;
    const hasConflictingSession = scopeId === null
      ? this.hasActiveUnscopedSession(request.source)
      : this.hasActiveScopedSession({ source: request.source, scopeId });
    if (hasConflictingSession) {
      this.toastService.warning(
        'Another AI generation for this purpose is already in progress.',
        'AI Generation',
      );
      return null;
    }

    const status = signal<AiGenerationSessionStatus>('loading');
    const content = signal('');
    const reasoning = signal('');
    const error = signal<unknown | null>(null);
    const session: ManagedAiGenerationSession = {
      id: request.streamId,
      source: request.source,
      scopeId,
      status,
      content,
      reasoning,
      error,
      completion: Promise.resolve({
        status: 'failed',
        content: '',
        reasoning: '',
        error: null,
      }),
      stopRequested: false,
    };

    this.managedSessions.set(session.id, session);
    this.notifySessionsChanged();
    request.onStatusChange?.('loading');
    session.completion = this.runSession(session, request);

    return session;
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.managedSessions.get(sessionId);
    if (!session || this.isTerminal(session.status())) return;

    session.stopRequested = true;
    await this.aiStreamService.stopStream(sessionId);
  }

  release(sessionId: string): void {
    const session = this.managedSessions.get(sessionId);
    if (!session || !this.isTerminal(session.status())) return;

    this.managedSessions.delete(sessionId);
    this.notifySessionsChanged();
  }

  private async runSession(
    session: ManagedAiGenerationSession,
    request: StartAiGenerationSessionRequest,
  ): Promise<AiGenerationSessionResult> {
    try {
      const generatedText = await this.aiStreamService.streamText({
        streamId: request.streamId,
        bookId: request.bookId,
        aiPrompt: request.aiPrompt,
        provider: request.provider,
        modelId: request.modelId,
        reasoningMode: request.reasoningMode,
        onToken: token => {
          if (!token) return;

          session.content.update(current => current + token);
          request.onContentChange?.(session.content());
        },
        onReasoningUpdate: reasoningText => {
          session.reasoning.set(reasoningText);
          request.onReasoningChange?.(reasoningText);
        },
        onStatusChange: nextStatus => {
          if (nextStatus === 'idle' || this.isTerminal(session.status())) return;

          session.status.set(nextStatus);
          request.onStatusChange?.(nextStatus);
          this.notifySessionsChanged();
        },
      });

      if (!session.content() && generatedText) {
        session.content.set(generatedText);
        request.onContentChange?.(generatedText);
      }

      const terminalStatus = 'complete';
      session.status.set(terminalStatus);
      request.onStatusChange?.(terminalStatus);

      return this.resultFor(session, terminalStatus, null);
    } catch (caughtError) {
      const terminalStatus = session.stopRequested ? 'stopped' : 'failed';
      session.error.set(session.stopRequested ? null : caughtError);
      session.status.set(terminalStatus);
      request.onStatusChange?.(terminalStatus);

      return this.resultFor(
        session,
        terminalStatus,
        session.stopRequested ? null : caughtError,
      );
    } finally {
      this.notifySessionsChanged();
    }
  }

  private resultFor(
    session: ManagedAiGenerationSession,
    status: AiGenerationSessionResult['status'],
    error: unknown | null,
  ): AiGenerationSessionResult {
    return {
      status,
      content: session.content(),
      reasoning: session.reasoning(),
      error,
    };
  }

  private isTerminal(status: AiGenerationSessionStatus): boolean {
    return status === 'complete' || status === 'stopped' || status === 'failed';
  }

  private hasActiveUnscopedSession(source: AiGenerationSessionSource): boolean {
    return [...this.managedSessions.values()].some(session => (
      session.source === source
      && session.scopeId === null
      && !this.isTerminal(session.status())
    ));
  }

  private notifySessionsChanged(): void {
    this.sessionsVersion.update(version => version + 1);
  }
}
