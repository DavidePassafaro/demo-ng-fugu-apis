import { Injectable, signal } from '@angular/core';

/**
 * Tracks whether at least one gamepad is connected, app-wide.
 * Used by the stage camera; the Gamepad page keeps its own polling logic.
 */
@Injectable({ providedIn: 'root' })
export class GamepadConnectionService {
  readonly isSupported = typeof navigator !== 'undefined' && 'getGamepads' in navigator;

  readonly isConnected = signal(false);

  constructor() {
    if (!this.isSupported) return;
    const refresh = (): void => this.isConnected.set(this.hasGamepads());
    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    refresh();
  }

  private hasGamepads(): boolean {
    return navigator.getGamepads().some((gp) => gp?.connected);
  }
}
