import { Component, OnDestroy, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HUION_VENDOR_ID, WebHidService } from '../web-hid.service';

@Component({
  selector: 'app-web-hid-connect',
  imports: [RouterLink],
  templateUrl: './web-hid-connect.html',
  styleUrl: './web-hid-connect.scss',
})
export class WebHidConnect implements OnDestroy {
  protected readonly hidService = inject(WebHidService);
  private readonly router = inject(Router);

  readonly huionVendorId = HUION_VENDOR_ID;

  protected error = '';

  // Auto-navigate only when the connection state transitions false → true.
  // This prevents redirect when the page loads with a device already paired.
  private wasConnected = this.hidService.isTabletConnected();

  private readonly onHidConnect = (_e: HIDConnectionEvent): void => {
    void this.refreshDevices();
  };

  private readonly onHidDisconnect = (e: HIDConnectionEvent): void => {
    this.hidService.removeDevice(e.device);
  };

  constructor() {
    if (this.hidService.isSupported) {

      // 👇🏻👇🏻👇🏻
      navigator.hid.addEventListener('connect', this.onHidConnect);
      navigator.hid.addEventListener('disconnect', this.onHidDisconnect);


      void this.refreshDevices();
    }

    effect(() => {
      const connected = this.hidService.isTabletConnected();
      if (connected && !this.wasConnected) {
        void this.router.navigate(['/apis/web-hid/tablet']);
      }
      this.wasConnected = connected;
    });
  }

  /**
   * Opens the browser's HID device picker with no filters, allowing the user to
   * grant access to any HID device via `navigator.hid.requestDevice()`.
   */
  async requestAny(): Promise<void> {
    this.error = '';
    try {

      // 👇🏻👇🏻👇🏻
      const granted = await navigator.hid.requestDevice({ filters: [] });


      this.hidService.mergeDevices(granted);

      if (this.hidService.isTabletConnected()) {
        void this.router.navigate(['/apis/web-hid/tablet']);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        this.error = err.message;
      }
    }
  }

  /**
   * Opens the HID device picker filtered to Huion tablets (vendorId 0x256C)
   * and navigates to the tablet workspace on success.
   */
  async requestTablet(): Promise<void> {
    this.error = '';
    try {

      // 👇🏻👇🏻👇🏻
      const granted = await navigator.hid.requestDevice({
        filters: [{ vendorId: HUION_VENDOR_ID }],
      });


      this.hidService.mergeDevices(granted);

      if (this.hidService.isTabletConnected()) {
        void this.router.navigate(['/apis/web-hid/tablet']);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        this.error = err.message;
      }
    }
  }

  /**
   * Re-enumerates previously granted HID devices via `navigator.hid.getDevices()`.
   */
  private async refreshDevices(): Promise<void> {

    // 👇🏻👇🏻👇🏻
    const all = await navigator.hid.getDevices();


    this.hidService.devices.set(all);
  }

  ngOnDestroy(): void {
    if (!this.hidService.isSupported) return;
    navigator.hid.removeEventListener('connect', this.onHidConnect);
    navigator.hid.removeEventListener('disconnect', this.onHidDisconnect);
  }
}
