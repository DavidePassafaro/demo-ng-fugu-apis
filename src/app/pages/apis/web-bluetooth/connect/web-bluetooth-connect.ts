import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PRINTER_SERVICE_UUIDS, WebBluetoothService } from '../web-bluetooth.service';

@Component({
  selector: 'app-web-bluetooth-connect',
  imports: [RouterLink],
  templateUrl: './web-bluetooth-connect.html',
  styleUrl: './web-bluetooth-connect.scss',
})
export class WebBluetoothConnect {
  protected readonly bluetoothService = inject(WebBluetoothService);
  private readonly router = inject(Router);

  protected error = '';

  // Auto-navigate only when the connection state transitions false → true.
  // This prevents redirect when the page loads with a device already paired.
  private wasConnected = this.bluetoothService.isPrinterConnected();

  constructor() {
    if (this.bluetoothService.isSupported) {
      void this.refreshDevices();
    }

    effect(() => {
      const connected = this.bluetoothService.isPrinterConnected();
      if (connected && !this.wasConnected) {
        void this.router.navigate(['/apis/web-bluetooth/printer']);
      }
      this.wasConnected = connected;
    });
  }

  /**
   * Opens the browser's Web Bluetooth device picker with no filters (`acceptAllDevices: true`),
   * allowing the user to grant access to any BLE device via `navigator.bluetooth.requestDevice()`.
   */
  async requestAny(): Promise<void> {
    this.error = '';
    try {

      // 👇🏻👇🏻👇🏻
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICE_UUIDS,
      });


      this.bluetoothService.mergeDevice(device);

      if (this.bluetoothService.isPrinterConnected()) {
        void this.router.navigate(['/apis/web-bluetooth/printer']);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotFoundError' && err.name !== 'NotAllowedError') {
        this.error = err.message;
      }
    }
  }

  /**
   * Opens the Web Bluetooth device picker filtered to NETUM / 58mm ESC/POS
   * thermal printers and navigates to the photo booth workspace on success.
   */
  async requestPrinter(): Promise<void> {
    this.error = '';
    try {

      // 👇🏻👇🏻👇🏻
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: PRINTER_SERVICE_UUIDS },
          { namePrefix: 'NETUM' },
          { namePrefix: 'NT-' },
          { namePrefix: 'MTP' },
          { namePrefix: 'PT-' },
          { namePrefix: 'Printer' },
          { namePrefix: 'BlueTooth Printer' },
          { namePrefix: 'RPP' },
          { namePrefix: 'POS' },
          { namePrefix: 'GOOJPRT' },
        ],
        optionalServices: PRINTER_SERVICE_UUIDS,
      });


      this.bluetoothService.mergeDevice(device);

      if (this.bluetoothService.isPrinterConnected()) {
        void this.router.navigate(['/apis/web-bluetooth/printer']);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotFoundError' && err.name !== 'NotAllowedError') {
        this.error = err.message;
      }
    }
  }

  /**
   * Re-enumerates previously granted Bluetooth devices via `navigator.bluetooth.getDevices()`
   * when supported by the browser.
   */
  private async refreshDevices(): Promise<void> {
    if (!navigator.bluetooth.getDevices) return;

    // 👇🏻👇🏻👇🏻
    const all = await navigator.bluetooth.getDevices();


    if (all.length > 0) {
      this.bluetoothService.devices.set(all);
    }
  }
}
