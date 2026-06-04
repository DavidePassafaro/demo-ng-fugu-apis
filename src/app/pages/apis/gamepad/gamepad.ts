import { Component, OnDestroy, signal, afterNextRender } from '@angular/core';
import { GamepadCard } from '../../../shared/components/gamepad-panel/gamepad-card';
import { GamepadState } from '../../../shared/model/gamepad.types';

/** Map of known Vendor+Product IDs to friendly names. */
const PRODUCT_NAMES: Record<string, string> = {
  '045e:028e': 'Xbox 360 Controller',
  '045e:02d1': 'Xbox One Controller',
  '045e:02dd': 'Xbox One Controller (fw 2015)',
  '045e:02e3': 'Xbox Elite Controller',
  '045e:02ea': 'Xbox One S Controller',
  '045e:0b12': 'Xbox Series X|S Controller',
  '054c:0268': 'PS3 Controller',
  '054c:05c4': 'DualShock 4 v1',
  '054c:09cc': 'DualShock 4 v2',
  '054c:0ce6': 'DualSense (PS5)',
  '057e:2009': 'Nintendo Switch Pro Controller',
  '057e:200e': 'Nintendo Switch JoyCons (L+R)',
  '046d:c21d': 'Logitech F310',
  '046d:c21e': 'Logitech F510',
  '046d:c21f': 'Logitech F710',
  '0079:0006': 'DragonRise Generic USB',
  '2563:0523': '8BitDo SFC30',
  '2dc8:6101': '8BitDo SN30 Pro',
  '2dc8:ab20': '8BitDo Pro 2',
};

function resolveProductName(id: string): string {
  const match = id.match(/([0-9a-f]{4}):([0-9a-f]{4})/i);
  if (match) {
    const key = `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
    if (PRODUCT_NAMES[key]) return PRODUCT_NAMES[key];
  }
  const parenIdx = id.indexOf(' (');
  return parenIdx > -1 ? id.slice(0, parenIdx).trim() : id.trim() || 'Unknown Controller';
}

type BrowserGamepad = ReturnType<typeof navigator.getGamepads>[number];

function snapshotGamepad(gp: NonNullable<BrowserGamepad>): GamepadState {
  return {
    index: gp.index,
    id: gp.id,
    productName: resolveProductName(gp.id),
    connected: gp.connected,
    buttons: Array.from(gp.buttons).map((b) => ({ pressed: b.pressed, touched: b.touched, value: b.value })),
    axes: Array.from(gp.axes),
    timestamp: gp.timestamp,
  };
}

type VibrationActuator = {
  playEffect: (type: string, params: Record<string, unknown>) => Promise<unknown>;
};

@Component({
  selector: 'app-gamepad',
  imports: [GamepadCard],
  templateUrl: './gamepad.html',
  styleUrl: './gamepad.scss',
})
export class GamepadPage implements OnDestroy {
  readonly isSupported = 'getGamepads' in navigator;

  readonly gamepads = signal<GamepadState[]>([]);

  private rafId: number | null = null;

  private readonly onConnected = (_e: GamepadEvent): void => {
    this.startLoop();
  };

  private readonly onDisconnected = (e: GamepadEvent): void => {
    this.gamepads.update((prev) => prev.filter((g) => g.index !== e.gamepad.index));
    const remaining = Array.from(navigator.getGamepads()).filter(Boolean);
    if (remaining.length === 0) {
      this.stopLoop();
    }
  };

  constructor() {
    if (!this.isSupported) return;

    window.addEventListener('gamepadconnected', this.onConnected);
    window.addEventListener('gamepaddisconnected', this.onDisconnected);

    afterNextRender(() => {
      const existing = Array.from(navigator.getGamepads()).filter(Boolean);
      if (existing.length > 0) this.startLoop();
    });
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    const tick = (): void => {
      this.poll();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private poll(): void {
    const states: GamepadState[] = [];
    for (const gp of navigator.getGamepads()) {
      if (gp && gp.connected) {
        states.push(snapshotGamepad(gp));
      }
    }
    this.gamepads.set(states);
  }

  async onVibrate(params: { index: number; weakMagnitude: number; strongMagnitude: number; duration: number }): Promise<void> {
    const gp = navigator.getGamepads()[params.index];
    if (!gp) return;

    const actuator = (gp as unknown as { vibrationActuator?: VibrationActuator }).vibrationActuator;
    if (!actuator) return;

    try {
      await actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: params.duration,
        weakMagnitude: params.weakMagnitude,
        strongMagnitude: params.strongMagnitude,
      });
    } catch {
      // Silently ignore — not all browsers support dual-rumble
    }
  }

  ngOnDestroy(): void {
    this.stopLoop();
    window.removeEventListener('gamepadconnected', this.onConnected);
    window.removeEventListener('gamepaddisconnected', this.onDisconnected);
  }
}
