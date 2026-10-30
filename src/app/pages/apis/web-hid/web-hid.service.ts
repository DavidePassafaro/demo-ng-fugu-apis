import { Injectable, computed, signal } from '@angular/core';

export const HUION_VENDOR_ID = 9580; // 0x256C

@Injectable({ providedIn: 'root' })
export class WebHidService {
  readonly isSupported = 'hid' in navigator;

  /** All HID devices that have been granted permission in this session. */
  readonly devices = signal<HIDDevice[]>([]);

  /** All interfaces belonging to the Huion tablet (a single tablet can expose multiple HID interfaces). */
  readonly huionDevices = computed(() =>
    this.devices().filter((d) => d.vendorId === HUION_VENDOR_ID),
  );

  /** The first Huion interface — used for display name only. */
  readonly huionDevice = computed(() => this.huionDevices()[0] ?? null);

  readonly isTabletConnected = computed(() => this.huionDevices().length > 0);

  mergeDevices(incoming: HIDDevice[]): void {
    this.devices.update((prev) => {
      const merged = [...prev];
      for (const d of incoming) {
        if (!merged.includes(d)) merged.push(d);
      }
      return merged;
    });
  }

  removeDevice(device: HIDDevice): void {
    this.devices.update((prev) => prev.filter((d) => d !== device));
  }
}
