import { Injectable } from '@angular/core';

/**
 * Standard 58mm thermal printer dot width (384 dots = 48 bytes per line).
 */
export const THERMAL_PRINT_WIDTH = 384;

/**
 * - `atkinson` ("Photo"): Atkinson error diffusion, keeps shades as fine grain.
 *   It spreads only 6/8 of the error, so it stays lighter than Floyd–Steinberg: good for thermal paper.
 * - `threshold` ("Stencil"): plain 50% cut, bold black & white silhouette.
 */
export type DitherMode = 'atkinson' | 'threshold';

/**
 * BLE transport + raster tuning. A faster stream keeps the printer feeding continuously:
 * when it runs out of data it stops between raster bands, leaving white lines on dark areas.
 */
export interface PrintTuning {
  /** Bytes per GATT write. */
  chunkSize: number;
  /** Pause between GATT writes, in ms. */
  packetDelayMs: number;
  /** Rows per `GS v 0` raster command. */
  bandHeight: number;
}

export type PrintTuningPresetId = 'safe' | 'balanced' | 'fast';

/**
 * Hard limits: beyond these the NETUM NT-1809DD buffer overflowed, dropped bytes,
 * and got stuck waiting for raster data (power cycle needed).
 */
export const PRINT_TUNING_LIMITS = {
  chunkSize: { min: 20, max: 200 },
  packetDelayMs: { min: 4, max: 40 },
  bandHeight: { min: 8, max: 128 },
} as const;

export const PRINT_TUNING_PRESETS: Record<PrintTuningPresetId, PrintTuning> = {
  // Original values: printer stalls after every 24-row band.
  safe: { chunkSize: 96, packetDelayMs: 18, bandHeight: 24 },
  balanced: { chunkSize: 128, packetDelayMs: 10, bandHeight: 64 },
  // Verified on NETUM NT-1809DD: noticeably fewer white lines.
  fast: { chunkSize: 180, packetDelayMs: 6, bandHeight: 128 },
};

/**
 * Pacing for the BLE stream so the printer's small receive buffer never overflows.
 * The NT-1809DD is rated 70 mm/s, but dark photo rows print much slower (the head fires
 * them in several strobes): white header rows went through, then the photo overflowed
 * the buffer. So we assume 40 mm/s × 8 dots/mm × 48 bytes/row ≈ 15 KB/s, and never stay
 * more than ~2 KB ahead of that estimate.
 */
export const PRINTER_CONSUME_BYTES_PER_SEC = 40 * 8 * (THERMAL_PRINT_WIDTH / 8);
export const PRINTER_MAX_BYTES_AHEAD = 2048;

export function clampPrintTuning(t: PrintTuning): PrintTuning {
  const clamp = (v: number, { min, max }: { min: number; max: number }): number =>
    Math.max(min, Math.min(max, Math.round(Number.isFinite(v) ? v : min)));
  return {
    chunkSize: clamp(t.chunkSize, PRINT_TUNING_LIMITS.chunkSize),
    packetDelayMs: clamp(t.packetDelayMs, PRINT_TUNING_LIMITS.packetDelayMs),
    bandHeight: clamp(t.bandHeight, PRINT_TUNING_LIMITS.bandHeight),
  };
}

export interface ReceiptRenderOptions {
  ditherMode: DitherMode;
  brightness: number;
  contrast: number;
  /**
   * Thermal dot-gain compensation (0–100). Printed dots spread and merge on paper,
   * so midtones come out darker than the 1-bit preview: this lightens midtones
   * (gamma 1.0 → 2.2) before dithering.
   */
  dotGain: number;
  removeBg: boolean;
  foregroundMask: Uint8Array | null;
  pthEdition: boolean;
  caption: string;
  includeTimestamp: boolean;
}

interface MediaPipeMask {
  getAsFloat32Array(): Float32Array;
  getAsUint8Array(): Uint8Array;
  close(): void;
}

interface MediaPipeSegmentResult {
  confidenceMasks?: MediaPipeMask[];
  categoryMask?: MediaPipeMask;
  close(): void;
}

interface MediaPipeImageSegmenter {
  segment(image: HTMLCanvasElement): MediaPipeSegmentResult;
  close(): void;
}

const MEDIAPIPE_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';
const MEDIAPIPE_WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const SELFIE_SEGMENTER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

const PTH_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="212" height="37" viewBox="0 0 212 37" fill="none">
  <g transform="scale(0.072266)">
    <polygon fill="#000000" points="259,12 487,93 452,395 259,501 66,395 31,93"/>
    <polygon fill="#ffffff" points="229,133 300,133 390,360 310,360 259,233 207,360 125,360"/>
    <polygon fill="#ffffff" points="366,133 410,133 432,173 410,212 366,212"/>
  </g>
  <text x="43" y="26" fill="#000000" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="800" textLength="167" lengthAdjust="spacingAndGlyphs">angularday '26</text>
</svg>`;

/**
 * Dedicated helper service for 58mm thermal receipt image processing, 1-bit dithering,
 * MediaPipe selfie background removal, and ESC/POS raster byte encoding.
 */
@Injectable({ providedIn: 'root' })
export class ThermalPrinterImageService {
  private pthLogoImg: HTMLImageElement | null = null;
  private segmenter: MediaPipeImageSegmenter | null = null;
  private segmenterPromise: Promise<MediaPipeImageSegmenter> | null = null;

  /**
   * Preloads the angularday '26 SVG header logo for 1-bit canvas rendering.
   */
  preloadLogo(onLoaded?: () => void): void {
    if (this.pthLogoImg) {
      onLoaded?.();
      return;
    }
    const logo = new Image();
    logo.onload = () => {
      this.pthLogoImg = logo;
      onLoaded?.();
    };
    logo.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PTH_LOGO_SVG);
  }

  /**
   * Captures the current webcam video frame onto a 384px-wide mirrored offscreen canvas.
   */
  captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
    const aspect = video.videoHeight / video.videoWidth;
    const width = THERMAL_PRINT_WIDTH;
    const height = Math.max(120, Math.round((width * aspect) / 8) * 8);

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, width, height);
    }
    return offscreen;
  }

  /**
   * Decodes an imported image file, scales it proportionally to 384px width,
   * and handles transparent PNGs (inverting white-on-transparent logos before compositing on white).
   */
  loadImageFile(file: File): Promise<HTMLCanvasElement> {
    const objectUrl = URL.createObjectURL(file);
    return this.loadDataUrl(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
  }

  /**
   * Decodes an image URL or base64 data URL into a 384px-wide normalized source canvas.
   */
  loadDataUrl(srcUrl: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const natW = img.naturalWidth || img.width || THERMAL_PRINT_WIDTH;
        const natH = img.naturalHeight || img.height || 240;

        const width = THERMAL_PRINT_WIDTH;
        const scale = Math.min(width / natW, 640 / natH);
        const drawW = Math.max(1, Math.round(natW * scale));
        const drawH = Math.max(1, Math.round(natH * scale));
        const height = Math.max(64, Math.ceil(drawH / 8) * 8);
        const offsetX = Math.floor((width - drawW) / 2);
        const offsetY = Math.floor((height - drawH) / 2);

        const rawCanvas = document.createElement('canvas');
        rawCanvas.width = width;
        rawCanvas.height = height;
        const rawCtx = rawCanvas.getContext('2d');
        if (!rawCtx) {
          reject(new Error('Could not initialize 2D canvas context.'));
          return;
        }

        rawCtx.drawImage(img, offsetX, offsetY, drawW, drawH);
        const rawData = rawCtx.getImageData(0, 0, width, height);
        const px = rawData.data;

        let transparentCount = 0;
        let opaqueCount = 0;
        let opaqueLumSum = 0;
        const totalPx = width * height;

        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3];
          if (a < 32) {
            transparentCount++;
          } else {
            opaqueCount++;
            opaqueLumSum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          }
        }

        const hasTransparency = transparentCount > totalPx * 0.1;
        const avgOpaqueLum = opaqueCount > 0 ? opaqueLumSum / opaqueCount : 0;
        const invertWhiteOnTransparent = hasTransparency && avgOpaqueLum > 235;

        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3] / 255;
          let r = px[i];
          let g = px[i + 1];
          let b = px[i + 2];

          if (invertWhiteOnTransparent && a > 0.05) {
            r = 255 - r;
            g = 255 - g;
            b = 255 - b;
          }

          px[i] = Math.round(r * a + 255 * (1 - a));
          px[i + 1] = Math.round(g * a + 255 * (1 - a));
          px[i + 2] = Math.round(b * a + 255 * (1 - a));
          px[i + 3] = 255;
        }

        rawCtx.putImageData(rawData, 0, 0);
        resolve(rawCanvas);
      };

      img.onerror = () => {
        reject(new Error('Could not decode the selected image file.'));
      };

      img.src = srcUrl;
    });
  }

  /**
   * Runs MediaPipe Selfie Segmenter on `sourceCanvas` to return a binary foreground mask
   * (`1` = person, `0` = background), or `null` if no person is detected.
   */
  async computeForegroundMask(sourceCanvas: HTMLCanvasElement): Promise<Uint8Array | null> {
    try {
      const seg = await this.ensureSegmenter();
      const result = seg.segment(sourceCanvas);
      const confMask = result.confidenceMasks?.[0];
      let maskResult: Uint8Array | null = null;

      if (confMask) {
        const floats = confMask.getAsFloat32Array();
        const mask = new Uint8Array(floats.length);
        let fgCount = 0;
        for (let i = 0; i < floats.length; i++) {
          if (floats[i] >= 0.5) {
            mask[i] = 1;
            fgCount++;
          }
        }
        maskResult = fgCount >= floats.length * 0.02 ? mask : null;
      }
      result.close();
      return maskResult;
    } catch (err) {
      console.warn('[ThermalPrinterImageService] Background segmentation failed:', err);
      return null;
    }
  }

  /**
   * Renders the complete 1-bit monochrome thermal receipt onto `targetCanvas`
   * (angularday '26 header + dithered photo + footer caption/timestamp) and returns the total height.
   */
  renderReceipt(
    targetCanvas: HTMLCanvasElement,
    sourceCanvas: HTMLCanvasElement,
    options: ReceiptRenderOptions,
  ): number {
    const width = THERMAL_PRINT_WIDTH;
    const imgHeight = sourceCanvas.height;
    const headerHeight = options.pthEdition ? 74 : 0;
    const captionLines = this.wrapCaptionLines(options.caption, 30);
    const hasCaption = captionLines.length > 0 || options.includeTimestamp;
    const footerHeight = !hasCaption ? 0 : captionLines.length > 1 ? 78 : 56;
    const totalHeight = headerHeight + imgHeight + footerHeight;
    this.lastReceiptLayout = { headerHeight, imgHeight, totalHeight };

    targetCanvas.width = width;
    targetCanvas.height = totalHeight;

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return totalHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, totalHeight);

    // 1. Draw the RGB photo at y = headerHeight and dither that region to 1-bit monochrome
    ctx.drawImage(sourceCanvas, 0, headerHeight);
    const imgData = ctx.getImageData(0, headerHeight, width, imgHeight);
    this.applyMonochromeDithering(imgData, width, imgHeight, options);
    ctx.putImageData(imgData, 0, headerHeight);

    // 2. Draw crisp 1-bit angularday '26 logo header if enabled
    if (options.pthEdition) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, headerHeight);

      if (this.pthLogoImg) {
        const logoW = 352;
        const logoH = Math.round(logoW * (37 / 212));
        const logoX = Math.floor((width - logoW) / 2);
        ctx.drawImage(this.pthLogoImg, logoX, 6, logoW, logoH);
      }

      const headerData = ctx.getImageData(0, 0, width, headerHeight);
      const hd = headerData.data;
      for (let i = 0; i < hd.length; i += 4) {
        const lum = 0.299 * hd[i] + 0.587 * hd[i + 1] + 0.114 * hd[i + 2];
        const bit = lum < 200 ? 0 : 255;
        hd[i] = bit;
        hd[i + 1] = bit;
        hd[i + 2] = bit;
        hd[i + 3] = 255;
      }
      ctx.putImageData(headerData, 0, 0);
    }

    // 3. Draw crisp 1-bit footer caption (up to 2 lines) + timestamp if enabled
    if (hasCaption) {
      const footerY = headerHeight + imgHeight;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, footerY, width, footerHeight);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';

      if (captionLines.length > 0) {
        ctx.font = 'bold 18px "Courier New", monospace';
        captionLines.forEach((line, idx) => {
          ctx.fillText(line, width / 2, footerY + 24 + idx * 22);
        });
      }

      if (options.includeTimestamp) {
        ctx.font = 'bold 13px "Courier New", monospace';
        const formattedDate = new Date().toLocaleDateString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const dateY = captionLines.length > 1 ? footerY + 66 : captionLines.length === 1 ? footerY + 44 : footerY + 28;
        ctx.fillText(formattedDate, width / 2, dateY);
      }

      const footerData = ctx.getImageData(0, footerY, width, footerHeight);
      const fd = footerData.data;
      for (let i = 0; i < fd.length; i += 4) {
        const lum = 0.299 * fd[i] + 0.587 * fd[i + 1] + 0.114 * fd[i + 2];
        const bit = lum < 175 ? 0 : 255;
        fd[i] = bit;
        fd[i + 1] = bit;
        fd[i + 2] = bit;
        fd[i + 3] = 255;
      }
      ctx.putImageData(footerData, 0, footerY);
    }

    return totalHeight;
  }

  /**
   * Wraps the receipt caption into at most 2 lines of `maxChars` characters,
   * preserving consecutive spaces typed by the user.
   */
  private wrapCaptionLines(raw: string, maxChars = 30): string[] {
    if (!raw.trim()) return [];
    if (raw.length <= maxChars) return [raw];

    // Find the last space at or before maxChars so words aren't cut in half
    const breakIdx = raw.lastIndexOf(' ', maxChars);
    if (breakIdx > 0) {
      const line1 = raw.slice(0, breakIdx);
      const line2 = raw.slice(breakIdx + 1, breakIdx + 1 + maxChars);
      return line2.length > 0 ? [line1, line2] : [line1];
    }

    // No space found within the first line: hard-split at maxChars
    const line1 = raw.slice(0, maxChars);
    const line2 = raw.slice(maxChars, maxChars * 2);
    return line2.length > 0 ? [line1, line2] : [line1];
  }

  /**
   * Encodes a 1-bit monochrome canvas (width = 384px) into ESC/POS `GS v 0` raster bands,
   * followed by line feeds (`ESC d n`).
   */
  /** Row layout of the last rendered receipt (header / dithered photo / footer). */
  lastReceiptLayout = { headerHeight: 0, imgHeight: 0, totalHeight: 0 };

  /**
   * @param breaks When given, raster commands are split only at these rows (e.g. so the
   *   whole photo is one `GS v 0` block, with no command boundary — and no line — inside it).
   *   Otherwise the canvas is sliced into fixed `bandHeight` bands.
   */
  encodeCanvasToEscPos(
    canvas: HTMLCanvasElement,
    feedLines = 4,
    bandHeight = 24,
    breaks: number[] | null = null,
  ): Uint8Array {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array(0);

    const width = THERMAL_PRINT_WIDTH;
    const height = canvas.height;
    const widthBytes = width / 8;
    const imageData = ctx.getImageData(0, 0, width, height).data;

    const BAND_HEIGHT = Math.max(
      PRINT_TUNING_LIMITS.bandHeight.min,
      Math.min(PRINT_TUNING_LIMITS.bandHeight.max, Math.round(bandHeight)),
    );
    const chunks: number[] = [];

    // ESC @ (Initialize printer) + ESC a 1 (Center alignment)
    chunks.push(0x1b, 0x40, 0x1b, 0x61, 0x01);

    const bands: [number, number][] = [];
    if (breaks) {
      const cuts = [0, ...breaks.filter((r) => r > 0 && r < height).sort((a, b) => a - b), height];
      for (let i = 0; i < cuts.length - 1; i++) {
        if (cuts[i + 1] > cuts[i]) bands.push([cuts[i], cuts[i + 1] - cuts[i]]);
      }
    } else {
      for (let yStart = 0; yStart < height; yStart += BAND_HEIGHT) {
        bands.push([yStart, Math.min(BAND_HEIGHT, height - yStart)]);
      }
    }
    const maxBandRows = Math.max(BAND_HEIGHT, ...bands.map(([, rows]) => rows));

    for (const [yStart, bandRows] of bands) {

      // GS v 0 m xL xH yL yH
      chunks.push(
        0x1d,
        0x76,
        0x30,
        0x00,
        widthBytes & 0xff,
        (widthBytes >> 8) & 0xff,
        bandRows & 0xff,
        (bandRows >> 8) & 0xff,
      );

      for (let y = 0; y < bandRows; y++) {
        const rowY = yStart + y;
        for (let xByte = 0; xByte < widthBytes; xByte++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = xByte * 8 + bit;
            const idx = (rowY * width + x) * 4;
            const r = imageData[idx];
            const g = imageData[idx + 1];
            const b = imageData[idx + 2];
            const a = imageData[idx + 3];
            const luminance = a < 128 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
            if (luminance < 128) {
              byteVal |= 1 << (7 - bit);
            }
          }
          chunks.push(byteVal);
        }
      }
    }

    // Safety flush: if BLE dropped a few raster bytes, the printer would sit forever waiting
    // for the rest of the last `GS v 0` block and ignore every following job. One band of
    // zeros completes it with blank rows; if nothing was dropped they're NUL bytes and ignored.
    for (let i = 0; i < maxBandRows * widthBytes; i++) {
      chunks.push(0x00);
    }

    // ESC @ (reset state) + ESC a 0 (left align) + ESC d n (feed)
    chunks.push(0x1b, 0x40, 0x1b, 0x61, 0x00, 0x1b, 0x64, Math.max(1, Math.min(10, feedLines)));
    return new Uint8Array(chunks);
  }

  /**
   * Builds a quick ESC/POS text receipt payload to verify communication with the 58mm printer.
   */
  buildTestReceiptBytes(): Uint8Array {
    const encoder = new TextEncoder();
    const now = new Date().toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const lines = [
      '\x1b\x40',
      '\x1b\x61\x01',
      '\x1b\x21\x30',
      'PROJECT FUGU\n',
      '\x1b\x21\x00',
      'NETUM 58mm BLE Thermal Printer\n',
      '--------------------------------\n',
      '\x1b\x61\x00',
      `Date: ${now}\n`,
      `API:  navigator.bluetooth\n`,
      `Spec: ESC/POS 384dots (58mm)\n`,
      '--------------------------------\n',
      '\x1b\x61\x01',
      'Ready to print selfies! 📸\n',
      '\x1b\x64\x04',
    ];
    return encoder.encode(lines.join(''));
  }

  private async ensureSegmenter(): Promise<MediaPipeImageSegmenter> {
    if (this.segmenter) return this.segmenter;
    if (this.segmenterPromise) return this.segmenterPromise;

    this.segmenterPromise = (async () => {
      const mp = await import(/* @vite-ignore */ MEDIAPIPE_CDN);
      const vision = await mp.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);
      const seg: MediaPipeImageSegmenter = await mp.ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: SELFIE_SEGMENTER_MODEL,
        },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      this.segmenter = seg;
      return seg;
    })();

    return this.segmenterPromise;
  }

  private applyMonochromeDithering(
    imageData: ImageData,
    width: number,
    height: number,
    options: ReceiptRenderOptions,
  ): void {
    const data = imageData.data;
    const lum = new Float32Array(width * height);
    const mask = options.foregroundMask;
    const applyBgMask = options.removeBg && mask !== null && mask.length === width * height;

    const bOffset = options.brightness * 1.8;
    const cVal = options.contrast * 1.8;
    const cFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
    const gamma = 1 + (Math.max(0, Math.min(100, options.dotGain)) / 100) * 1.2;

    for (let i = 0; i < width * height; i++) {
      if (applyBgMask && mask[i] === 0) {
        lum[i] = 255;
        continue;
      }
      const idx = i * 4;
      let gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray = cFactor * (gray - 128) + 128 + bOffset;
      gray = Math.max(0, Math.min(255, gray));
      if (gamma !== 1) {
        gray = 255 * Math.pow(gray / 255, 1 / gamma);
      }
      lum[i] = gray;
    }

    const mode = options.ditherMode;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;

        if (applyBgMask && mask[i] === 0) {
          lum[i] = 255;
          continue;
        }

        const oldVal = lum[i];
        let newVal: number;

        newVal = oldVal < 128 ? 0 : 255;

        lum[i] = newVal;
        const err = oldVal - newVal;

        if (mode === 'atkinson') {
          const share = err / 8;
          if (x + 1 < width) lum[i + 1] += share;
          if (x + 2 < width) lum[i + 2] += share;
          if (y + 1 < height) {
            if (x > 0) lum[i + width - 1] += share;
            lum[i + width] += share;
            if (x + 1 < width) lum[i + width + 1] += share;
          }
          if (y + 2 < height) {
            lum[i + width * 2] += share;
          }
        }
      }
    }

    for (let i = 0; i < width * height; i++) {
      const v = applyBgMask && mask[i] === 0 ? 255 : lum[i] < 128 ? 0 : 255;
      const idx = i * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
}
