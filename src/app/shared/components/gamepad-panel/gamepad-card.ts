import { Component, input, output, computed, signal } from '@angular/core';
import { GamepadState } from '../../model/gamepad.types';

@Component({
  selector: 'app-gamepad-card',
  templateUrl: './gamepad-card.html',
  styleUrl: './gamepad-panel.scss',
})
export class GamepadCard {
  readonly gamepad = input.required<GamepadState>();
  readonly vibrate = output<{ index: number; weakMagnitude: number; strongMagnitude: number; duration: number }>();

  readonly weakMagnitude = signal(1);
  readonly strongMagnitude = signal(1);
  readonly duration = signal(3000);

  readonly leftAxes = computed(() => {
    const axes = this.gamepad().axes;
    return { x: axes[0] ?? 0, y: axes[1] ?? 0 };
  });

  readonly rightAxes = computed(() => {
    const axes = this.gamepad().axes;
    return { x: axes[2] ?? 0, y: axes[3] ?? 0 };
  });

  readonly leftDotStyle = computed(() => {
    const { x, y } = this.leftAxes();
    return {
      left: `${((x + 1) / 2) * 100}%`,
      top: `${((y + 1) / 2) * 100}%`,
    };
  });

  readonly rightDotStyle = computed(() => {
    const { x, y } = this.rightAxes();
    return {
      left: `${((x + 1) / 2) * 100}%`,
      top: `${((y + 1) / 2) * 100}%`,
    };
  });

  readonly buttonRows = computed(() => {
    const buttons = this.gamepad().buttons;
    const rows: { label: string; index: number }[][] = [
      [
        { label: 'A', index: 0 },
        { label: 'B', index: 1 },
        { label: 'X', index: 2 },
        { label: 'Y', index: 3 },
      ],
      [
        { label: 'LB', index: 4 },
        { label: 'RB', index: 5 },
        { label: 'LT', index: 6 },
        { label: 'RT', index: 7 },
      ],
      [
        { label: 'Back', index: 8 },
        { label: 'Start', index: 9 },
        { label: 'LS', index: 10 },
        { label: 'RS', index: 11 },
      ],
      [
        { label: '↑', index: 12 },
        { label: '↓', index: 13 },
        { label: '←', index: 14 },
        { label: '→', index: 15 },
      ],
    ];
    return rows.map((row) =>
      row.map((btn) => ({
        ...btn,
        state: buttons[btn.index] ?? { pressed: false, touched: false, value: 0 },
      })),
    );
  });

  triggerVibrate(): void {
    this.vibrate.emit({
      index: this.gamepad().index,
      weakMagnitude: this.weakMagnitude(),
      strongMagnitude: this.strongMagnitude(),
      duration: this.duration(),
    });
  }
}
