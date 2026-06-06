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
import { WebHidService } from '../../../../shared/services/web-hid.service';

type Tool = 'brush' | 'eraser';

interface Point {
  x: number;
  y: number;
}

export interface ParsedPenData {
  flags: number;        // raw byte 0
  proximity: boolean;   // bit 6 (0x40)
  tipDown: boolean;     // bit 0 (0x01)
  button1: boolean;     // bit 1 (0x02)
  button2: boolean;     // bit 2 (0x04)
  x: number;
  y: number;
  pressure: number;
}

export interface HidReportSnapshot {
  deviceIndex: number;
  reportId: number;
  hex: string;
  parsed: ParsedPenData | null;
  timestamp: number;
}

/**
 * Parse the most common Huion pen report layout:
 *   Byte 0: flags  [bit0=tip, bit1=btn1, bit2=btn2, bit6=proximity]
 *   Byte 1-2: X LE uint16
 *   Byte 3-4: Y LE uint16
 *   Byte 5-6: Pressure LE uint16
 */
function parsePenReport(data: DataView): ParsedPenData | null {
  if (data.byteLength < 7) return null;
  const flags = data.getUint8(0);
  return {
    flags,
    proximity: !!(flags & 0x40),
    tipDown: !!(flags & 0x01),
    button1: !!(flags & 0x02),
    button2: !!(flags & 0x04),
    x: data.getUint16(1, true),
    y: data.getUint16(3, true),
    pressure: data.getUint16(5, true),
  };
}

@Component({
  selector: 'app-web-hid-tablet',
  imports: [RouterLink],
  templateUrl: './web-hid-tablet.html',
  styleUrl: './web-hid-tablet.scss',
})
export class WebHidTablet implements OnDestroy {
  protected readonly hidService = inject(WebHidService);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  // ── Tool state ────────────────────────────────────────────────────────────
  readonly tool = signal<Tool>('brush');
  readonly color = signal('#1a1a2e');
  readonly brushSize = signal(6);
  readonly opacity = signal(1.0);

  readonly deviceName = computed(() => this.hidService.huionDevice()?.productName ?? '');

  // ── HID event display ─────────────────────────────────────────────────────
  readonly lastReport = signal<HidReportSnapshot | null>(null);
  readonly recentReports = signal<HidReportSnapshot[]>([]);

  /**
   * Auto-calibrated axis ranges.
   * Start at the Huion common default (2047 = 2^11 - 1).
   * Update automatically when we see higher values in the reports.
   */
  readonly maxX = signal(2047);
  readonly maxY = signal(2047);
  readonly maxPressure = signal(2047);

  // ── Drawing state ─────────────────────────────────────────────────────────
  private isDrawing = false;
  private lastPoint: Point | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private openedDevices: HIDDevice[] = [];

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef()?.nativeElement;
      if (canvas) {
        this.ctx = canvas.getContext('2d');
        this.fillBackground();
      }
      void this.openAllInterfaces();
    });
  }

  // ── Device management ─────────────────────────────────────────────────────

  /**
   * Opens all HID interfaces exposed by the Huion tablet and attaches
   * an `inputreport` listener to each one via `device.open()`.
   */
  private async openAllInterfaces(): Promise<void> {
    for (const [index, device] of this.hidService.huionDevices().entries()) {
      try {
        if (!device.opened) await device.open();

        const listener = (event: HIDInputReportEvent): void => {
          this.onInputReport(event, index);
        };

        // 👇🏻👇🏻👇🏻
        device.addEventListener('inputreport', listener);


        this.openedDevices.push(device);
        (device as HIDDevice & { _listener?: (e: HIDInputReportEvent) => void })._listener = listener;
      } catch (err) {
        console.warn(`[WebHID] Could not open interface ${index}:`, err);
      }
    }
  }

  /**
   * Handles each `inputreport` HID event: decodes the raw bytes to hex,
   * parses the pen data, auto-calibrates axis ranges, and drives the canvas.
   * @param event {HIDInputReportEvent}
   * @param deviceIndex {number}
   */
  private onInputReport(event: HIDInputReportEvent, deviceIndex: number): void {
    const data = event.data;
    const bytes: string[] = [];
    for (let i = 0; i < data.byteLength; i++) {
      bytes.push(data.getUint8(i).toString(16).padStart(2, '0'));
    }

    const parsed = parsePenReport(data);
    this.lastReport.set({ deviceIndex, reportId: event.reportId, hex: bytes.join(' '), parsed, timestamp: Date.now() });
    this.recentReports.update((prev) => [
      { deviceIndex, reportId: event.reportId, hex: bytes.join(' '), parsed, timestamp: Date.now() },
      ...prev,
    ].slice(0, 8));

    if (!parsed) return;

    // Auto-calibrate: grow the axis ranges if we see larger values
    if (parsed.x > this.maxX()) this.maxX.set(parsed.x);
    if (parsed.y > this.maxY()) this.maxY.set(parsed.y);
    if (parsed.pressure > this.maxPressure()) this.maxPressure.set(parsed.pressure);

    this.handlePenInput(parsed);
  }

  /**
   * Translates parsed pen coordinates and pressure into canvas draw calls,
   * toggling between hover cursor, active stroke, and out-of-range states.
   * @param parsed {ParsedPenData}
   */
  private handlePenInput(parsed: ParsedPenData): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.ctx) return;

    const xPct = (parsed.x / this.maxX()) * 100;
    const yPct = (parsed.y / this.maxY()) * 100;

    const inRange = parsed.proximity || parsed.tipDown;

    if (inRange) {
      // Update hover cursor — visible only while hovering, hidden while drawing
      this.penCursor.set({ x: xPct, y: yPct, visible: !parsed.tipDown });

      if (parsed.tipDown) {
        const cx = (xPct / 100) * canvas.width;
        const cy = (yPct / 100) * canvas.height;
        const pressureNorm = Math.min(1, parsed.pressure / this.maxPressure());
        const point: Point = { x: cx, y: cy };

        if (!this.isDrawing) {
          this.isDrawing = true;
          this.lastPoint = point;
          this.drawDot(point, pressureNorm);
        } else {
          this.drawStroke(point, pressureNorm);
          this.lastPoint = point;
        }
      } else {
        // Hovering — end any active stroke
        if (this.isDrawing) {
          this.isDrawing = false;
          this.lastPoint = null;
          this.ctx.beginPath();
        }
      }
    } else {
      // Out of range entirely
      this.penCursor.set({ x: xPct, y: yPct, visible: false });
      if (this.isDrawing) {
        this.isDrawing = false;
        this.lastPoint = null;
        this.ctx.beginPath();
      }
    }
  }

  // ── Canvas primitives ─────────────────────────────────────────────────────

  private fillBackground(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.ctx) return;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private drawDot(point: Point, pressure: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = this.tool() === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath();
    ctx.arc(point.x, point.y, this.computeSize(pressure) / 2, 0, Math.PI * 2);
    ctx.fillStyle = this.computeColor();
    ctx.fill();
    ctx.beginPath();
  }

  private drawStroke(to: Point, pressure: number): void {
    if (!this.ctx || !this.lastPoint) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = this.tool() === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.computeSize(pressure);
    ctx.strokeStyle = this.computeColor();
    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
  }

  private computeSize(pressure: number): number {
    return Math.max(1, this.brushSize() * Math.max(0.3, pressure) * 2);
  }

  private computeColor(): string {
    if (this.tool() === 'eraser') return 'rgba(0,0,0,1)';
    const hex = this.color();
    const alpha = this.opacity();
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ── Toolbar actions ───────────────────────────────────────────────────────

  /**
   * Fills the canvas with a white background, discarding all drawn strokes.
   */
  clearCanvas(): void {
    this.fillBackground();
  }

  /** Pen cursor position as CSS percentages — shown when hovering but not drawing. */
  readonly penCursor = signal<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  /** Pre-compute flag bits for the template (bit-shift not supported in Angular templates). */
  flagBits(flags: number): Array<{ bit: number; on: boolean; hex: string }> {
    return [7, 6, 5, 4, 3, 2, 1, 0].map((bit) => ({
      bit,
      on: !!(flags & (1 << bit)),
      hex: (1 << bit).toString(16),
    }));
  }

  /**
   * Resets the auto-calibrated axis maximums back to the Huion default (2047).
   */
  resetCalibration(): void {
    this.maxX.set(2047);
    this.maxY.set(2047);
    this.maxPressure.set(2047);
  }

  /**
   * Loads a local image file onto the canvas, scaling it to fit while preserving aspect ratio.
   * @param event {Event}
   */
  importImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.ctx) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.fillBackground();
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        this.ctx!.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  /**
   * Exports the canvas as a PNG and triggers a browser download via a temporary anchor.
   */
  saveImage(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'painting.png';
    a.click();
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    for (const device of this.openedDevices) {
      const d = device as HIDDevice & { _listener?: (e: HIDInputReportEvent) => void };
      if (d._listener) d.removeEventListener('inputreport', d._listener);
      if (device.opened) void device.close();
    }
    this.openedDevices = [];
  }
}
