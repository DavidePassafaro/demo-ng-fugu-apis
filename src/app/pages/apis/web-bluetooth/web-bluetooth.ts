import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { WebBluetoothService } from './web-bluetooth.service';

@Component({
  selector: 'app-web-bluetooth',
  imports: [RouterOutlet],
  templateUrl: './web-bluetooth.html',
  styleUrl: './web-bluetooth.scss',
})
export class WebBluetooth {
  readonly bluetoothService = inject(WebBluetoothService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The raffle stage needs every pixel for the QR code and participants. */
  readonly isRafflePage = computed(() => this.url().startsWith('/apis/web-bluetooth/raffle'));
}
