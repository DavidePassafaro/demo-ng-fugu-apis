import { Component, OnDestroy, signal } from '@angular/core';

@Component({
  selector: 'app-screen-wake-lock',
  templateUrl: './screen-wake-lock.html',
  styleUrl: './screen-wake-lock.scss',
})
export class ScreenWakeLock implements OnDestroy {
  readonly isSupported = 'wakeLock' in navigator;

  readonly isActive = signal(false);
  readonly error = signal('');
  readonly releaseReason = signal('');

  private sentinel: WakeLockSentinel | null = null;

  // Re-acquire the lock when the page becomes visible again
  // (browsers release it automatically on page hide / tab switch)
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.isActive()) {
      void this.acquire();
    }
  };

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Requests a screen wake lock via `navigator.wakeLock.request('screen')`,
   * preventing the display from dimming or locking while the page is visible.
   */
  async acquire(): Promise<void> {
    this.error.set('');
    this.releaseReason.set('');

    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.isActive.set(true);

      this.sentinel.addEventListener('release', () => {
        this.isActive.set(false);
        this.releaseReason.set('Wake lock was released by the browser.');
        this.sentinel = null;
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        this.error.set('Wake lock denied — the page must be visible and in focus.');
      } else {
        this.error.set(err instanceof Error ? err.message : 'Failed to acquire wake lock.');
      }
    }
  }

  /**
   * Releases the active `WakeLockSentinel`, allowing the screen to dim normally.
   */
  async release(): Promise<void> {
    if (!this.sentinel) return;
    await this.sentinel.release();
    this.releaseReason.set('Released manually.');
    this.sentinel = null;
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    void this.sentinel?.release();
  }
}
