import { Injectable, computed, signal } from '@angular/core';
import { BlePacketSnapshot } from '../web-bluetooth/web-bluetooth.service';

/** USB device class for printers (USB Printer Class 1.1). */
export const USB_PRINTER_CLASS = 0x07;

export interface UsbPrinterDetails {
  vendorId: string;
  productId: string;
  interfaceNumber: number;
  interfaceClass: string;
  endpointNumber: number;
  packetSize: number;
}

/**
 * WebUSB transport for the 58mm ESC/POS thermal printer (e.g. NETUM NT-1809DD over its USB port).
 *
 * Unlike Bluetooth, USB bulk transfers have built-in flow control: the printer NAKs while its
 * buffer is full and `transferOut()` simply waits. Data also arrives far faster than the head
 * prints, so the photo comes out in one continuous pass (no white lines, no lost bytes).
 */
@Injectable({ providedIn: 'root' })
export class WebUsbPrinterService {
  readonly isSupported = typeof navigator !== 'undefined' && 'usb' in navigator;

  readonly device = signal<USBDevice | null>(null);
  readonly details = signal<UsbPrinterDetails | null>(null);
  readonly isConnected = computed(() => this.device() !== null);
  readonly deviceName = computed(() => {
    const d = this.device();
    if (!d) return 'USB Thermal Printer';
    return [d.manufacturerName, d.productName].filter(Boolean).join(' ') || 'USB Thermal Printer';
  });

  private endpointNumber: number | null = null;

  constructor() {
    if (this.isSupported) {
      navigator.usb.addEventListener('disconnect', (event) => {
        if (event.device === this.device()) {
          this.device.set(null);
          this.details.set(null);
          this.endpointNumber = null;
        }
      });
    }
  }

  /**
   * Opens the browser's USB device picker. With `printersOnly`, only devices exposing the
   * USB Printer class are listed; otherwise every USB device is shown.
   */
  async requestPrinter(printersOnly = true): Promise<void> {

    // 👇🏻👇🏻👇🏻
    const device = await navigator.usb.requestDevice({
      filters: printersOnly ? [{ classCode: USB_PRINTER_CLASS }] : [],
    });


    await this.setDevice(device);
  }

  /** Restores a printer granted in a previous visit via `navigator.usb.getDevices()`. */
  async restoreGrantedPrinter(): Promise<void> {
    if (!this.isSupported || this.device()) return;

    // 👇🏻👇🏻👇🏻
    const devices = await navigator.usb.getDevices();


    const printer = devices.find((d) => this.findBulkOut(d) !== null) ?? devices[0];
    if (printer) {
      await this.setDevice(printer).catch(() => undefined);
    }
  }

  /** Opens the device, claims the printer interface and finds its bulk OUT endpoint. */
  async ensureOpen(): Promise<void> {
    const device = this.device();
    if (!device) throw new Error('No USB thermal printer connected.');
    if (device.opened && this.endpointNumber !== null) return;

    // 👇🏻👇🏻👇🏻
    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(device.configurations[0]?.configurationValue ?? 1);
    }

    const target = this.findBulkOut(device);
    if (!target) {
      throw new Error('This USB device has no bulk OUT endpoint: it does not look like a printer.');
    }

    await device.claimInterface(target.iface.interfaceNumber);
    if (target.alt.alternateSetting !== 0) {
      await device.selectAlternateInterface(target.iface.interfaceNumber, target.alt.alternateSetting);
    }


    this.endpointNumber = target.endpoint.endpointNumber;
    this.details.set({
      vendorId: '0x' + device.vendorId.toString(16).padStart(4, '0'),
      productId: '0x' + device.productId.toString(16).padStart(4, '0'),
      interfaceNumber: target.iface.interfaceNumber,
      interfaceClass:
        target.alt.interfaceClass === USB_PRINTER_CLASS
          ? 'Printer (0x07)'
          : '0x' + target.alt.interfaceClass.toString(16).padStart(2, '0'),
      endpointNumber: target.endpoint.endpointNumber,
      packetSize: target.endpoint.packetSize,
    });
  }

  /**
   * Streams raw ESC/POS bytes to the printer's bulk OUT endpoint. Chunks only exist to
   * report progress: `transferOut()` itself waits whenever the printer is busy.
   */
  async send(data: Uint8Array, onPacket: (snapshot: BlePacketSnapshot) => void): Promise<void> {
    await this.ensureOpen();
    const device = this.device();
    const endpoint = this.endpointNumber;
    if (!device || endpoint === null) throw new Error('USB printer endpoint is unavailable.');

    const CHUNK_SIZE = 2048;
    const totalChunks = Math.ceil(data.byteLength / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

      // 👇🏻👇🏻👇🏻
      let result = await device.transferOut(endpoint, chunk);


      if (result.status === 'stall') {
        await device.clearHalt('out', endpoint);
        result = await device.transferOut(endpoint, chunk);
      }
      if (result.status !== 'ok') {
        throw new Error(`USB transfer failed at chunk ${i + 1}/${totalChunks} (status: ${result.status}).`);
      }

      const hexPreview = Array.from(chunk.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
      onPacket({
        chunkIndex: i + 1,
        totalChunks,
        byteLength: chunk.byteLength,
        hex: chunk.byteLength > 16 ? `${hexPreview} …` : hexPreview,
        timestamp: Date.now(),
      });
    }
  }

  private async setDevice(device: USBDevice): Promise<void> {
    this.endpointNumber = null;
    this.details.set(null);
    this.device.set(device);
    await this.ensureOpen();
  }

  /** Prefers a USB Printer class interface; falls back to any interface with a bulk OUT endpoint. */
  private findBulkOut(
    device: USBDevice,
  ): { iface: USBInterface; alt: USBAlternateInterface; endpoint: USBEndpoint } | null {
    const config = device.configuration ?? device.configurations[0];
    if (!config) return null;

    let fallback: { iface: USBInterface; alt: USBAlternateInterface; endpoint: USBEndpoint } | null = null;
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const endpoint = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
        if (!endpoint) continue;
        if (alt.interfaceClass === USB_PRINTER_CLASS) return { iface, alt, endpoint };
        fallback ??= { iface, alt, endpoint };
      }
    }
    return fallback;
  }
}
