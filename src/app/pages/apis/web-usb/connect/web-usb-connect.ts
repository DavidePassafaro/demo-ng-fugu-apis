import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WebUsbPrinterService } from '../web-usb-printer.service';

@Component({
  selector: 'app-web-usb-connect',
  imports: [RouterLink],
  templateUrl: './web-usb-connect.html',
  styleUrl: '../../web-bluetooth/connect/web-bluetooth-connect.scss',
})
export class WebUsbConnect {
  protected readonly usbService = inject(WebUsbPrinterService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly error = signal('');

  // Auto-navigate only when the connection state transitions false → true.
  private wasConnected = this.usbService.isConnected();

  constructor() {
    void this.usbService.restoreGrantedPrinter();

    effect(() => {
      const connected = this.usbService.isConnected();
      if (connected && !this.wasConnected) {
        void this.router.navigate(['printer'], { relativeTo: this.route });
      }
      this.wasConnected = connected;
    });
  }

  /** Picker filtered to the USB Printer class (0x07), or every USB device as a fallback. */
  async request(printersOnly: boolean): Promise<void> {
    this.error.set('');
    try {
      await this.usbService.requestPrinter(printersOnly);
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotFoundError') {
        this.error.set(
          err.name === 'SecurityError' || err.name === 'NetworkError'
            ? `${err.message} — the OS may be holding the printer: close other printing apps and retry.`
            : err.message,
        );
      }
    }
  }
}
