import { Component, inject, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { WebHidService, HUION_VENDOR_ID } from '../../../../shared/services/web-hid.service';

@Component({
  selector: 'app-web-hid-connect',
  imports: [RouterLink],
  templateUrl: './web-hid-connect.html',
  styleUrl: './web-hid-connect.scss',
})
export class WebHidConnect {
  protected readonly hidService = inject(WebHidService);
  private readonly router = inject(Router);

  readonly huionVendorId = HUION_VENDOR_ID;

  protected error = '';

  // Auto-navigate only when the connection state transitions false → true.
  // This prevents redirect when the page loads with a device already paired.
  private wasConnected = this.hidService.isTabletConnected();

  constructor() {
    effect(() => {
      const connected = this.hidService.isTabletConnected();
      if (connected && !this.wasConnected) {
        void this.router.navigate(['/apis/web-hid/tablet']);
      }
      this.wasConnected = connected;
    });
  }

  async requestAny(): Promise<void> {
    this.error = '';
    try {
      await this.hidService.requestAny();
      // If the user re-selected an already-known Huion, isTabletConnected stays
      // true and the effect won't fire — navigate explicitly.
      if (this.hidService.isTabletConnected()) {
        void this.router.navigate(['/apis/web-hid/tablet']);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        this.error = err.message;
      }
    }
  }

  async requestTablet(): Promise<void> {
    this.error = '';
    try {
      await this.hidService.requestTablet();
      // Same: explicit navigate in case the device was already in the list.
      if (this.hidService.isTabletConnected()) {
        void this.router.navigate(['/apis/web-hid/tablet']);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        this.error = err.message;
      }
    }
  }
}
