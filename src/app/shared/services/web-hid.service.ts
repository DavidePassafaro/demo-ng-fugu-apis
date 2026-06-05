import { Injectable, computed, signal } from '@angular/core';

export const HUION_VENDOR_ID = 9580; // 0x256C

@Injectable({ providedIn: 'root' })
export class WebHidService {
  readonly isSupported = 'hid' in navigator;

  /** All HID devices that have been granted permission in this session. */
  readonly devices = signal<HIDDevice[]>([]);

  /** All interfaces belonging to the Huion tablet (a single tablet can expose multiple HID interfaces). */
  readonly huionDevices = computed(() => this.devices().filter((d) => d.vendorId === HUION_VENDOR_ID));

  /** The first Huion interface — used for display name only. */
  readonly huionDevice = computed(() => this.huionDevices()[0] ?? null);

  readonly isTabletConnected = computed(() => this.huionDevices().length > 0);

  private readonly onHidConnect = (_e: HIDConnectionEvent): void => {
    // Re-enumerate: pick up the newly granted device
    void this.refreshDevices();
  };

  private readonly onHidDisconnect = (e: HIDConnectionEvent): void => {
    this.devices.update((prev) => prev.filter((d) => d !== e.device));
  };

  constructor() {
    if (!this.isSupported) return;
    navigator.hid.addEventListener('connect', this.onHidConnect);
    navigator.hid.addEventListener('disconnect', this.onHidDisconnect);
    // Re-hydrate previously granted devices
    void this.refreshDevices();
  }

  /**
   * Shows the browser's HID device picker with no vendor filter via `navigator.hid.requestDevice()`.
   */
  async requestAny(): Promise<void> {
    const granted = await navigator.hid.requestDevice({ filters: [] });
    this.mergeDevices(granted);
  }

  /**
   * Shows the HID device picker pre-filtered to Huion tablets (vendorId 0x256C).
   */
  async requestTablet(): Promise<void> {
    const granted = await navigator.hid.requestDevice({ filters: [{ vendorId: HUION_VENDOR_ID }] });
    this.mergeDevices(granted);
  }

  /**
   * Re-enumerates previously granted HID devices via `navigator.hid.getDevices()`
   * and replaces the current device list with the full result.
   */
  private async refreshDevices(): Promise<void> {
    const all = await navigator.hid.getDevices();
    this.devices.set(all);
  }

  private mergeDevices(incoming: HIDDevice[]): void {
    this.devices.update((prev) => {
      const merged = [...prev];
      for (const d of incoming) {
        if (!merged.includes(d)) merged.push(d);
      }
      return merged;
    });
  }
}
