interface ClosableWindow {
  close(): void;
  webContents: {
    send(channel: string): void;
  };
}

interface PreventableCloseEvent {
  preventDefault(): void;
}

interface AppCloseCoordinatorOptions {
  getWindow: () => ClosableWindow | null;
  installUpdate: () => boolean;
  timeoutMs?: number;
}

export class AppCloseCoordinator {
  private readonly getWindow: () => ClosableWindow | null;
  private readonly installUpdate: () => boolean;
  private readonly timeoutMs: number;
  private readyToClose = false;
  private updateInstallPending = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AppCloseCoordinatorOptions) {
    this.getWindow = options.getWindow;
    this.installUpdate = options.installUpdate;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  handleWindowClose(event: PreventableCloseEvent): void {
    if (this.readyToClose) return;

    const window = this.getWindow();
    if (!window) return;

    event.preventDefault();
    window.webContents.send('app:before-close');
    if (this.closeTimer !== null) return;

    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.finishClose();
    }, this.timeoutMs);
  }

  requestUpdateInstall(): void {
    if (this.updateInstallPending) return;

    const window = this.getWindow();
    if (!window) throw new Error('The main application window is not available.');

    this.updateInstallPending = true;
    window.close();
  }

  handleRendererReady(): void {
    this.finishClose();
  }

  private finishClose(): void {
    const window = this.getWindow();
    if (!window) return;

    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    this.readyToClose = true;
    if (this.updateInstallPending) {
      const installStarted = this.installUpdate();
      if (!installStarted) {
        this.readyToClose = false;
        this.updateInstallPending = false;
      }
      return;
    }

    window.close();
  }
}
