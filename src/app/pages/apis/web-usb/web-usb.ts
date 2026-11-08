import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { WebUsbPrinterService } from './web-usb-printer.service';

/**
 * WebUSB version of the thermal printer photo booth: same booth and raffle pages as
 * Web Bluetooth, but the ESC/POS bytes travel over the printer's USB cable.
 */
@Component({
  selector: 'app-web-usb',
  imports: [RouterOutlet],
  templateUrl: './web-usb.html',
  styleUrl: '../web-bluetooth/web-bluetooth.scss',
})
export class WebUsb {
  readonly usbService = inject(WebUsbPrinterService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The raffle stage needs every pixel for the QR code and participants. */
  readonly isRafflePage = computed(() => this.url().startsWith('/apis/web-usb/raffle'));
}
