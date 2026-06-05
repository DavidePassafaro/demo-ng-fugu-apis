import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type BadgeStatus = 'idle' | 'set' | 'dot' | 'cleared' | 'error';

@Component({
  selector: 'app-badging',
  imports: [FormsModule],
  templateUrl: './badging.html',
  styleUrl: './badging.scss',
})
export class Badging {
  readonly isSupported = 'setAppBadge' in navigator;

  count = 1;
  status = signal<BadgeStatus>('idle');
  error = signal('');
  currentBadge = signal<number | 'dot' | null>(null);

  /**
   * Sets the app badge to the current numeric count via `navigator.setAppBadge(count)`.
   */
  async setBadge(): Promise<void> {
    this.error.set('');
    try {
      await navigator.setAppBadge(this.count);
      this.status.set('set');
      this.currentBadge.set(this.count);
    } catch (err) {
      this.status.set('error');
      this.error.set(err instanceof Error ? err.message : 'Failed to set badge.');
    }
  }

  /**
   * Sets a dot badge (no count) via `navigator.setAppBadge()` with no arguments.
   */
  async setDot(): Promise<void> {
    this.error.set('');
    try {
      await navigator.setAppBadge();
      this.status.set('dot');
      this.currentBadge.set('dot');
    } catch (err) {
      this.status.set('error');
      this.error.set(err instanceof Error ? err.message : 'Failed to set badge.');
    }
  }

  /**
   * Removes the badge entirely via `navigator.clearAppBadge()`.
   */
  async clearBadge(): Promise<void> {
    this.error.set('');
    try {
      await navigator.clearAppBadge();
      this.status.set('cleared');
      this.currentBadge.set(null);
    } catch (err) {
      this.status.set('error');
      this.error.set(err instanceof Error ? err.message : 'Failed to clear badge.');
    }
  }
}
