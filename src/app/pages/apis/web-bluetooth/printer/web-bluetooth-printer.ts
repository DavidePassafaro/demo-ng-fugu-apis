import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DitherMode,
  ThermalPrinterImageService,
} from '../thermal-printer-image.service';
import {
  BlePacketSnapshot,
  GattDetails,
  PRINTER_WRITE_CHAR_UUIDS,
  WebBluetoothService,
} from '../web-bluetooth.service';

@Component({
  selector: 'app-web-bluetooth-printer',
  imports: [RouterLink],
  templateUrl: './web-bluetooth-printer.html',
  styleUrl: './web-bluetooth-printer.scss',
})
export class WebBluetoothPrinter implements OnDestroy {
  protected readonly bluetoothService = inject(WebBluetoothService);
  private readonly imageService = inject(ThermalPrinterImageService);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly receiptCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('receiptCanvas');

  // ── BLE GATT state ────────────────────────────────────────────────────────
  readonly deviceName = computed(
    () => this.bluetoothService.printerDevice()?.name || 'BLE Thermal Printer',
  );
  readonly gattDetails = signal<GattDetails | null>(null);
  readonly printProgress = signal<number | null>(null);
  readonly lastPacket = signal<BlePacketSnapshot | null>(null);
  readonly recentPackets = signal<BlePacketSnapshot[]>([]);
  readonly isPrinting = computed(() => this.printProgress() !== null);
  readonly printError = signal('');

  // ── Receipt & Camera UI state ─────────────────────────────────────────────
  readonly ditherMode = signal<DitherMode>('floyd-steinberg');
  readonly brightness = signal(10);
  readonly contrast = signal(20);
  readonly pthEdition = signal(true);
  readonly removeBg = signal(true);
  readonly caption = signal('PROJECT FUGU DEMO');
  readonly includeTimestamp = signal(true);

  readonly hasCapturedPhoto = signal(false);
  readonly canvasHeight = signal(320);
  readonly isSegmenting = signal(false);

  readonly isCameraSupported =
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    'getUserMedia' in navigator.mediaDevices;
  readonly isCameraActive = signal(false);
  readonly cameraError = signal('');

  private writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceCanvas: HTMLCanvasElement | null = null;
  private foregroundMask: Uint8Array | null = null;

  private readonly onGattDisconnected = (): void => {
    this.writeCharacteristic = null;
    this.gattDetails.set(null);
  };

  constructor() {
    afterNextRender(() => {
      this.imageService.preloadLogo(() => {
        if (this.hasCapturedPhoto()) {
          this.renderThermalPreview();
        }
      });

      if (this.bluetoothService.isPrinterConnected()) {
        void this.openPrinterConnection();
        if (this.isCameraSupported) {
          void this.startCamera();
        }
      }
    });
  }

  // ── Device management (Web Bluetooth GATT) ────────────────────────────────

  /**
   * Connects to the Bluetooth printer's GATT server, enumerates primary services,
   * and discovers the writable ESC/POS characteristic.
   */
  private async openPrinterConnection(): Promise<void> {
    const device = this.bluetoothService.printerDevice();
    if (!device?.gatt) return;

    try {
      device.removeEventListener('gattserverdisconnected', this.onGattDisconnected);

      // 👇🏻👇🏻👇🏻
      device.addEventListener('gattserverdisconnected', this.onGattDisconnected);
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();


      let chosenChar: BluetoothRemoteGATTCharacteristic | null = null;
      let chosenServiceUuid = '';

      for (const service of services) {

        // 👇🏻👇🏻👇🏻
        const characteristics = await service.getCharacteristics();


        for (const char of characteristics) {
          const isWritable = char.properties.write || char.properties.writeWithoutResponse;
          if (!isWritable) continue;

          if (PRINTER_WRITE_CHAR_UUIDS.includes(char.uuid.toLowerCase())) {
            chosenChar = char;
            chosenServiceUuid = service.uuid;
            break;
          }

          if (!chosenChar) {
            chosenChar = char;
            chosenServiceUuid = service.uuid;
          }
        }

        if (chosenChar && PRINTER_WRITE_CHAR_UUIDS.includes(chosenChar.uuid.toLowerCase())) {
          break;
        }
      }

      if (!chosenChar) {
        this.printError.set('No writable GATT characteristic found on this Bluetooth device.');
        return;
      }

      this.writeCharacteristic = chosenChar;
      this.gattDetails.set({
        serviceUuid: chosenServiceUuid,
        characteristicUuid: chosenChar.uuid,
        writeMode: chosenChar.properties.writeWithoutResponse
          ? 'writeWithoutResponse'
          : 'writeWithResponse',
      });
    } catch (err) {
      console.warn('[WebBluetooth] Could not open GATT connection:', err);
      this.printError.set(
        err instanceof Error ? err.message : 'Could not connect to GATT server.',
      );
    }
  }

  /**
   * Streams raw ESC/POS bytes to the connected BLE printer in 96-byte MTU-safe chunks
   * and logs each GATT packet in the inspector panel.
   * @param data {Uint8Array}
   */
  private async sendEscPosBytes(data: Uint8Array): Promise<void> {
    const device = this.bluetoothService.printerDevice();
    if (!device) {
      throw new Error('No Bluetooth thermal printer paired.');
    }

    if (!this.writeCharacteristic || !device.gatt?.connected) {
      await this.openPrinterConnection();
    }

    const characteristic = this.writeCharacteristic;
    if (!characteristic) {
      throw new Error('Printer GATT characteristic is unavailable.');
    }

    const CHUNK_SIZE = 96;
    const INTER_PACKET_DELAY_MS = 18;
    const totalChunks = Math.ceil(data.byteLength / CHUNK_SIZE);

    this.printProgress.set(0);

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const chunk = data.slice(start, start + CHUNK_SIZE);

        // 👇🏻👇🏻👇🏻
        if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
          await characteristic.writeValueWithoutResponse(chunk);
        } else {
          await characteristic.writeValue(chunk);
        }


        const hexPreview = Array.from(chunk.slice(0, 16))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');

        const snapshot: BlePacketSnapshot = {
          chunkIndex: i + 1,
          totalChunks,
          byteLength: chunk.byteLength,
          hex: chunk.byteLength > 16 ? `${hexPreview} …` : hexPreview,
          timestamp: Date.now(),
        };

        this.lastPacket.set(snapshot);
        this.recentPackets.update((prev) => [snapshot, ...prev].slice(0, 8));
        this.printProgress.set(Math.round(((i + 1) / totalChunks) * 100));

        if (i < totalChunks - 1) {
          await new Promise((resolve) => setTimeout(resolve, INTER_PACKET_DELAY_MS));
        }
      }
    } finally {
      setTimeout(() => this.printProgress.set(null), 600);
    }
  }

  /**
   * Encodes the 384px 1-bit receipt canvas into ESC/POS `GS v 0` raster bands
   * and streams them to the NETUM Bluetooth thermal printer.
   */
  async printCanvas(): Promise<void> {
    this.printError.set('');
    const canvas = this.receiptCanvasRef()?.nativeElement;
    if (!canvas) return;

    try {
      const escPosBytes = this.imageService.encodeCanvasToEscPos(canvas, 4);
      await this.sendEscPosBytes(escPosBytes);
    } catch (err) {
      this.printError.set(
        err instanceof Error ? err.message : 'Failed to print image over Bluetooth.',
      );
    }
  }

  /**
   * Sends a formatted ESC/POS text receipt to test the printer connection.
   */
  async printTestReceipt(): Promise<void> {
    this.printError.set('');
    try {
      await this.sendEscPosBytes(this.imageService.buildTestReceiptBytes());
    } catch (err) {
      this.printError.set(
        err instanceof Error ? err.message : 'Failed to send test receipt.',
      );
    }
  }

  /**
   * Advances the thermal paper by 3 blank lines (`ESC d 3`).
   */
  async feedPaper(): Promise<void> {
    this.printError.set('');
    try {
      await this.sendEscPosBytes(new Uint8Array([0x1b, 0x64, 3]));
    } catch (err) {
      this.printError.set(
        err instanceof Error ? err.message : 'Failed to feed paper.',
      );
    }
  }

  // ── Camera & Receipt actions ──────────────────────────────────────────────

  /**
   * Starts the webcam stream via `navigator.mediaDevices.getUserMedia()`.
   */
  async startCamera(): Promise<void> {
    this.cameraError.set('');
    this.stopCamera();

    if (!this.isCameraSupported) {
      this.cameraError.set('Camera API (navigator.mediaDevices.getUserMedia) is not available.');
      return;
    }

    try {

      // 👇🏻👇🏻👇🏻
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 768 },
          height: { ideal: 576 },
        },
        audio: false,
      });


      this.mediaStream = stream;
      this.isCameraActive.set(true);

      const video = this.videoRef()?.nativeElement;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch (err) {
      this.cameraError.set(
        err instanceof Error ? err.message : 'Could not access the camera.',
      );
    }
  }

  stopCamera(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
    const video = this.videoRef()?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
    this.isCameraActive.set(false);
  }

  async snapSelfie(): Promise<void> {
    const video = this.videoRef()?.nativeElement;
    if (!video || !this.isCameraActive() || !video.videoWidth) return;

    this.sourceCanvas = this.imageService.captureVideoFrame(video);
    this.foregroundMask = null;
    this.hasCapturedPhoto.set(true);
    this.renderThermalPreview();

    if (this.removeBg()) {
      await this.runSegmentation();
      this.renderThermalPreview();
    }
  }

  async importImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.printError.set('');
    try {
      this.sourceCanvas = await this.imageService.loadImageFile(file);
      this.foregroundMask = null;
      this.removeBg.set(false);
      this.hasCapturedPhoto.set(true);
      this.renderThermalPreview();
    } catch (err) {
      this.printError.set(
        err instanceof Error ? err.message : 'Could not decode the selected image file.',
      );
    }
  }

  async toggleRemoveBg(): Promise<void> {
    const next = !this.removeBg();
    this.removeBg.set(next);
    if (next && this.sourceCanvas && !this.foregroundMask) {
      await this.runSegmentation();
    }
    this.renderThermalPreview();
  }

  setDitherMode(mode: DitherMode): void {
    this.ditherMode.set(mode);
    this.renderThermalPreview();
  }

  updateBrightness(val: number): void {
    this.brightness.set(val);
    this.renderThermalPreview();
  }

  updateContrast(val: number): void {
    this.contrast.set(val);
    this.renderThermalPreview();
  }

  updateCaption(val: string): void {
    this.caption.set(val);
    this.renderThermalPreview();
  }

  toggleTimestamp(): void {
    this.includeTimestamp.update((v) => !v);
    this.renderThermalPreview();
  }

  togglePthEdition(): void {
    this.pthEdition.update((v) => !v);
    this.renderThermalPreview();
  }

  renderThermalPreview(): void {
    const canvas = this.receiptCanvasRef()?.nativeElement;
    if (!canvas || !this.sourceCanvas) return;

    const totalHeight = this.imageService.renderReceipt(canvas, this.sourceCanvas, {
      ditherMode: this.ditherMode(),
      brightness: this.brightness(),
      contrast: this.contrast(),
      removeBg: this.removeBg(),
      foregroundMask: this.foregroundMask,
      pthEdition: this.pthEdition(),
      caption: this.caption(),
      includeTimestamp: this.includeTimestamp(),
    });
    this.canvasHeight.set(totalHeight);
  }

  saveReceiptPng(): void {
    const canvas = this.receiptCanvasRef()?.nativeElement;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'thermal-selfie-58mm.png';
    a.click();
  }

  private async runSegmentation(): Promise<void> {
    if (!this.sourceCanvas) return;
    this.isSegmenting.set(true);
    try {
      this.foregroundMask = await this.imageService.computeForegroundMask(this.sourceCanvas);
    } finally {
      this.isSegmenting.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
    const device = this.bluetoothService.printerDevice();
    device?.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
  }
}
