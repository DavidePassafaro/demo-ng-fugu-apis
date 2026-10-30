import { Injectable, computed, signal } from '@angular/core';

/**
 * Known BLE GATT Service UUIDs used by NETUM and other 58mm ESC/POS Bluetooth 4.0 printers.
 */
export const PRINTER_SERVICE_UUIDS: string[] = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard BLE POS Printer service (0x18F0)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // ISSC / Microchip transparent UART (common in NETUM)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / HM-10 BLE UART service
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom 0xFF00 BLE printer service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Custom 0xFFE0 BLE serial service
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / common BLE printer service
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
  '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile UUID over BLE
];

/**
 * Known preferred Write Characteristic UUIDs for 58mm BLE thermal printers.
 */
export const PRINTER_WRITE_CHAR_UUIDS: string[] = [
  '00002af1-0000-1000-8000-00805f9b34fb', // 0x18F0 write characteristic
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // e7810a71 write characteristic
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // ISSC TX/Write characteristic
  '49535343-1e4d-4bd9-ba61-23c647249616', // ISSC UART characteristic
  '0000ff02-0000-1000-8000-00805f9b34fb', // 0xFF00 write characteristic
  '0000ffe1-0000-1000-8000-00805f9b34fb', // 0xFFE0 write characteristic
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART RX characteristic
];

export interface GattDetails {
  serviceUuid: string;
  characteristicUuid: string;
  writeMode: string;
}

export interface BlePacketSnapshot {
  chunkIndex: number;
  totalChunks: number;
  byteLength: number;
  hex: string;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class WebBluetoothService {
  readonly isSupported = 'bluetooth' in navigator;

  /** All Bluetooth devices that have been granted permission in this session. */
  readonly devices = signal<BluetoothDevice[]>([]);

  /** The currently active thermal printer device. */
  readonly printerDevice = computed(() => this.devices()[0] ?? null);

  readonly isPrinterConnected = computed(() => this.devices().length > 0);

  mergeDevice(incoming: BluetoothDevice): void {
    this.devices.update((prev) => [
      incoming,
      ...prev.filter((d) => d.id !== incoming.id),
    ]);
  }
}
