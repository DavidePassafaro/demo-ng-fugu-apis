import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebBluetoothService } from './web-bluetooth.service';

@Component({
  selector: 'app-web-bluetooth',
  imports: [RouterOutlet],
  templateUrl: './web-bluetooth.html',
  styleUrl: './web-bluetooth.scss',
})
export class WebBluetooth {
  readonly bluetoothService = inject(WebBluetoothService);
}
