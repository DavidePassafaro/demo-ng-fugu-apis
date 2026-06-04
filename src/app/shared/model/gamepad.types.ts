export interface GamepadButtonState {
  pressed: boolean;
  touched: boolean;
  value: number;
}

export interface GamepadState {
  index: number;
  id: string;
  productName: string;
  connected: boolean;
  buttons: GamepadButtonState[];
  axes: number[];
  timestamp: number;
}
