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

/**
 * Printed dot diameter relative to the 0.125mm dot pitch on the NETUM NT-1809DD.
 * Raise it if the paper still looks darker than the simulated preview, lower it if lighter.
 */
export const PAPER_DOT_SPREAD = 1.25;

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
  <g fill="#000000">
    <path d="M9.03192 27.8353H0V37H9.03192V27.8353Z"/>
    <path d="M81.2875 0.341309H72.2556V9.50597H81.2875V0.341309Z"/>
    <path d="M90.3203 9.50597V18.6706H81.288H72.2556V9.50597H63.2233V0.341309H54.1909H45.1586H36.1294V9.50597H45.1586V18.6706V27.8353V37H54.1909V27.8353V18.6706V9.50597H63.2233V18.6706V27.8353V37H72.2556V27.8353H81.288H90.3203V37H99.3527V27.8353V18.6706V9.50597V0.341309H90.3203V9.50597Z"/>
    <path d="M112.901 27.8353H103.869V37H112.901V27.8353Z"/>
    <path d="M106.773 7.51271H111.041C112.33 7.51271 113.282 7.19069 113.897 6.54988C114.516 5.90584 114.824 4.9752 114.824 3.8417C114.824 2.70819 114.516 1.82263 113.897 1.1786C113.278 0.534558 112.326 0.215759 111.041 0.215759H103.939V10.7715H106.773V7.51271ZM106.773 2.44735H110.632C111.095 2.44735 111.428 2.56006 111.635 2.78547C111.841 3.01089 111.942 3.29426 111.942 3.64204V4.07033C111.942 4.43743 111.838 4.73047 111.635 4.94944C111.428 5.16841 111.095 5.2779 110.632 5.2779H106.773V2.44735Z"/>
    <path d="M140.88 5.63855C141.232 5.104 141.407 4.42775 141.407 3.60983C141.407 2.51818 141.074 1.68093 140.404 1.09164C139.734 0.502342 138.792 0.212524 137.576 0.212524H130.506V10.7683H133.34V7.11017H136.431L138.557 10.7683H141.693L139.385 6.80748C140.026 6.56274 140.525 6.1731 140.877 5.63533L140.88 5.63855ZM138.525 3.79338C138.525 4.14116 138.421 4.42453 138.208 4.64351C137.998 4.86248 137.646 4.97197 137.151 4.97197H133.337V2.34107H137.151C137.656 2.34107 138.008 2.44734 138.214 2.65343C138.421 2.86274 138.522 3.13968 138.522 3.48746V3.79338H138.525Z"/>
    <path d="M146.203 2.55362V10.7715H149.037V2.55362H153.169V0.215759H142.071V2.55362H146.203Z"/>
    <path d="M160.091 10.984C161.125 10.984 162.049 10.8939 162.858 10.7103C163.667 10.5268 164.346 10.2176 164.892 9.78613C165.441 9.35462 165.857 8.77821 166.146 8.06655C166.431 7.35166 166.574 6.44035 166.574 5.41955C166.574 4.39875 166.431 3.54218 166.146 2.84984C165.86 2.1575 165.441 1.6004 164.892 1.17534C164.346 0.753493 163.667 0.450795 162.858 0.273685C162.049 0.0965741 161.138 0.00640869 160.091 0.00640869C159.043 0.00640869 158.12 0.0965741 157.307 0.273685C156.498 0.450795 155.819 0.753493 155.273 1.17534C154.724 1.59718 154.308 2.1575 154.023 2.84984C153.737 3.5454 153.591 4.40197 153.591 5.41955C153.591 6.43713 153.734 7.35166 154.023 8.06655C154.308 8.78143 154.727 9.35462 155.273 9.78613C155.822 10.2209 156.498 10.53 157.307 10.7103C158.117 10.8939 159.053 10.984 160.091 10.984ZM156.457 6.02817V4.91076C156.457 3.90928 156.765 3.2105 157.377 2.81442C157.99 2.41833 158.897 2.21868 160.091 2.21868C161.284 2.21868 162.188 2.41833 162.798 2.81442C163.407 3.21372 163.709 3.9125 163.709 4.91076V6.02817C163.709 7.08761 163.404 7.81215 162.798 8.19213C162.192 8.57534 161.287 8.76533 160.091 8.76533C158.894 8.76533 157.99 8.57534 157.377 8.19213C156.765 7.80893 156.457 7.08761 156.457 6.02817Z"/>
    <path d="M118.652 10.9712H125.999V8.12453H128.804V2.94324H125.999V8.12453H118.652V2.94324H115.846V8.12453H118.652V10.9712Z"/>
    <path d="M125.996 0.0933838H118.652V2.94325H125.996V0.0933838Z"/>
    <path d="M103.894 16.5872H108.026V24.8019H110.86V16.5872H114.992V14.2461H103.894V16.5872Z"/>
    <path d="M126.383 24.8019V22.5993H119.674V20.4707H124.799V18.3454H119.674V16.4487H126.322V14.2461H116.84V24.8019H126.383Z"/>
    <path d="M144.673 20.548H150.192V24.8019H153.026V14.2461H150.192V18.2069H144.673V14.2461H141.839V24.8019H144.673V20.548Z"/>
    <path d="M128.23 22.1163H131.036V24.9661L139.988 24.9629V22.113L131.039 22.1163V16.9382H139.988V14.0883H131.036V16.9382H128.23V22.1163Z"/>
    <path d="M168.729 24.6731V14.1173H165.895V18.0814H160.376V14.1173H157.542V24.6731H160.376V20.4192H165.895V24.6731H168.729Z"/>
    <path d="M192.523 19.0732C193.157 18.8574 193.595 18.5354 193.843 18.1007C194.09 17.6659 194.211 17.1894 194.211 16.6709C194.211 15.824 193.928 15.1864 193.367 14.7581C192.802 14.3298 191.999 14.1141 190.955 14.1141H183.884V24.6699H191.107C192.253 24.6699 193.11 24.4058 193.678 23.8745C194.246 23.3431 194.531 22.58 194.531 21.5785C194.531 20.9666 194.376 20.4418 194.065 20.0006C193.754 19.5626 193.24 19.2503 192.529 19.0667L192.523 19.0732ZM186.69 16.0011H190.127C190.53 16.0011 190.837 16.0881 191.053 16.2619C191.269 16.4358 191.377 16.6838 191.377 17.0122V17.3021C191.377 17.6498 191.269 17.9139 191.053 18.0975C190.837 18.281 190.53 18.3712 190.127 18.3712H186.69V16.0011ZM191.694 21.6461C191.694 22.0229 191.574 22.3095 191.332 22.5027C191.091 22.6959 190.752 22.7925 190.307 22.7925H186.69V20.1616H190.307C190.761 20.1616 191.104 20.255 191.342 20.445C191.577 20.635 191.697 20.9022 191.697 21.2468V21.6429L191.694 21.6461Z"/>
    <path d="M181.856 14.1173H179.047V22.0841H181.856V14.1173Z"/>
    <path d="M173.56 22.0808V14.1173H170.755V22.0841H173.547V24.9275H179.034V22.0776L173.56 22.0808Z"/>
    <path d="M20.3402 0.341309H18.0647H0V9.50597H18.0647H20.3402H27.0971V0.341309H20.3402Z"/>
    <path d="M27.0971 9.50598V18.6706H9.03235V27.8353H27.0971C32.0829 27.8353 36.1294 23.7296 36.1294 18.6706V9.50598H27.0971Z"/>
  </g>
  <g fill="#000000" stroke="#000000" stroke-width="0.35">
    <path d="M121.181 35.2096C120.746 35.4189 120.143 35.5219 119.382 35.5219C118.468 35.5219 117.751 35.2997 117.23 34.8586C116.71 34.4174 116.449 33.7058 116.449 32.73V32.0828C116.449 31.091 116.713 30.3857 117.236 29.9639C117.76 29.542 118.477 29.3327 119.382 29.3327C120.175 29.3327 120.788 29.4454 121.219 29.6676C121.651 29.8898 121.924 30.3149 122.038 30.9396H122.952C122.838 30.1056 122.489 29.5066 121.905 29.1395C121.321 28.7724 120.48 28.5889 119.382 28.5889C118.147 28.5889 117.202 28.8883 116.535 29.4905C115.869 30.0895 115.535 31.0749 115.535 32.4402C115.535 33.8056 115.869 34.7845 116.535 35.377C117.202 35.9695 118.15 36.2658 119.382 36.2658C120.464 36.2658 121.295 36.0887 121.867 35.7313C122.441 35.3738 122.806 34.8006 122.962 34.0117H122.048C121.905 34.601 121.616 35.0003 121.181 35.2064V35.2096Z"/>
    <path d="M131.016 29.4744C130.328 28.8851 129.309 28.5889 127.963 28.5889C126.618 28.5889 125.599 28.8851 124.91 29.4744C124.222 30.0637 123.876 31.0491 123.876 32.4273C123.876 33.8056 124.219 34.7652 124.91 35.3642C125.599 35.9631 126.618 36.2658 127.963 36.2658C129.309 36.2658 130.328 35.9663 131.016 35.3642C131.705 34.7652 132.051 33.8056 132.051 32.4273C132.051 31.0491 131.705 30.0637 131.016 29.4744ZM131.14 32.7719C131.14 33.6993 130.874 34.3884 130.344 34.8425C129.814 35.2965 129.02 35.5219 127.963 35.5219C126.907 35.5219 126.113 35.2965 125.583 34.8425C125.05 34.3884 124.787 33.6993 124.787 32.7719V32.028C124.787 31.0942 125.053 30.4115 125.583 29.98C126.116 29.5485 126.907 29.3327 127.963 29.3327C129.02 29.3327 129.814 29.5485 130.344 29.98C130.877 30.4115 131.14 31.0942 131.14 32.028V32.7719Z"/>
    <path d="M139.455 35.2096L134.752 28.708H133.508V36.1466H134.359V29.6032L139.097 36.1466H140.315V28.708H139.455V35.2096Z"/>
    <path d="M142.144 28.708V36.1466H143.048V32.8266H147.244V32.0731H143.048V29.4648H147.913V28.708H142.144Z"/>
    <path d="M149.964 32.7171H153.978V31.9958H149.964V29.4422H154.902V28.708H149.059V36.1466H154.946V35.4124H149.964V32.7171Z"/>
    <path d="M162.395 32.3404C162.665 31.9733 162.798 31.4999 162.798 30.9171C162.798 30.2183 162.604 29.6773 162.214 29.2909C161.824 28.9012 161.24 28.708 160.462 28.708H156.298V36.1466H157.203V33.1164H160.176L162.09 36.1466H163.131L161.176 33.052C161.722 32.9458 162.128 32.7075 162.398 32.3404H162.395ZM157.2 32.3951V29.4293H160.364C160.903 29.4293 161.287 29.5549 161.522 29.8029C161.757 30.0508 161.871 30.3696 161.871 30.756V31.0781C161.871 31.4581 161.754 31.7736 161.522 32.0216C161.287 32.2695 160.903 32.3951 160.364 32.3951H157.2Z"/>
    <path d="M165.261 32.7171H169.275V31.9958H165.261V29.4422H170.199V28.708H164.356V36.1466H170.243V35.4124H165.261V32.7171Z"/>
    <path d="M177.54 35.2096L172.836 28.708H171.592V36.1466H172.443V29.6032L177.181 36.1466H178.4V28.708H177.54V35.2096Z"/>
    <path d="M185.503 35.2096C185.068 35.4189 184.468 35.5219 183.703 35.5219C182.789 35.5219 182.072 35.2997 181.551 34.8586C181.031 34.4174 180.771 33.7058 180.771 32.73V32.0828C180.771 31.091 181.034 30.3857 181.558 29.9639C182.081 29.542 182.799 29.3327 183.703 29.3327C184.497 29.3327 185.109 29.4454 185.541 29.6676C185.972 29.8898 186.245 30.3149 186.359 30.9396H187.273C187.159 30.1056 186.81 29.5066 186.226 29.1395C185.642 28.7724 184.801 28.5889 183.703 28.5889C182.472 28.5889 181.523 28.8883 180.856 29.4905C180.19 30.0895 179.857 31.0749 179.857 32.4402C179.857 33.8056 180.19 34.7845 180.856 35.377C181.523 35.9695 182.472 36.2658 183.703 36.2658C184.785 36.2658 185.617 36.0887 186.188 35.7313C186.762 35.3738 187.127 34.8006 187.283 34.0117H186.369C186.226 34.601 185.937 35.0003 185.503 35.2064V35.2096Z"/>
    <path d="M189.473 32.7171H193.488V31.9958H189.473V29.4422H194.411V28.708H188.569V36.1466H194.456V35.4124H189.473V32.7171Z"/>
    <path d="M199.772 33.8893C200.314 33.6284 200.898 33.403 201.53 33.2227C202.158 33.0391 202.739 32.7912 203.263 32.4724C203.786 32.1568 204.05 31.574 204.05 30.727C204.05 29.951 203.789 29.4003 203.269 29.0783C202.748 28.7563 202.085 28.5953 201.171 28.5953C200.257 28.5953 199.53 28.7627 198.988 29.1008C198.445 29.439 198.144 30.0186 198.08 30.8365H199.004C199.061 30.2601 199.267 29.8673 199.619 29.6515C199.975 29.4357 200.492 29.3295 201.171 29.3295C201.739 29.3295 202.206 29.4196 202.574 29.6032C202.942 29.7867 203.126 30.1152 203.126 30.5886V30.8913C203.126 31.5321 202.856 31.9572 202.32 32.1697C201.781 32.3822 201.193 32.5851 200.556 32.7847C199.918 32.9812 199.331 33.2839 198.791 33.6896C198.252 34.0954 197.985 34.8102 197.985 35.831V36.1563H204.072V35.4028H198.899C198.94 34.6621 199.232 34.1598 199.775 33.8989L199.772 33.8893Z"/>
    <path d="M211.181 31.9121C210.635 31.5385 209.864 31.3518 208.864 31.3518C208.198 31.3518 207.639 31.4387 207.185 31.6158C206.732 31.7897 206.392 32.0441 206.167 32.3758C206.195 31.7736 206.268 31.2713 206.389 30.8784C206.509 30.4823 206.674 30.1699 206.884 29.9413C207.093 29.7095 207.354 29.5517 207.665 29.4615C207.976 29.3713 208.334 29.3263 208.737 29.3263C209.394 29.3263 209.892 29.41 210.229 29.5807C210.565 29.7513 210.778 29.9961 210.86 30.3181H211.774C211.67 29.7771 211.374 29.3585 210.898 29.0525C210.419 28.7466 209.705 28.5953 208.747 28.5953C208.207 28.5953 207.725 28.6629 207.293 28.8014C206.862 28.9366 206.494 29.1781 206.192 29.5227C205.891 29.8673 205.656 30.3342 205.491 30.9235C205.326 31.5128 205.24 32.2534 205.24 33.1422C205.24 34.2789 205.522 35.084 206.084 35.5605C206.649 36.0339 207.515 36.2722 208.693 36.2722C209.75 36.2722 210.562 36.0693 211.136 35.6636C211.711 35.2579 211.996 34.6138 211.996 33.7605C211.996 32.9071 211.724 32.2888 211.178 31.9185L211.181 31.9121ZM211.089 33.9472C211.089 34.4882 210.895 34.8875 210.505 35.1484C210.115 35.4124 209.512 35.5412 208.699 35.5412C207.792 35.5412 207.147 35.3834 206.77 35.0679C206.392 34.7523 206.202 34.2918 206.202 33.6896C206.202 33.1293 206.414 32.7107 206.833 32.437C207.255 32.1632 207.903 32.028 208.709 32.028C209.515 32.028 210.115 32.1536 210.505 32.4015C210.892 32.6495 211.089 33.0488 211.089 33.6027V33.9472Z"/>
  </g>
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
   * Preloads the Porto Tech Hub Conference 26 SVG header logo for 1-bit canvas rendering.
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
   * (Porto Tech Hub '26 header + dithered photo + footer caption/timestamp) and returns the total height.
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

    // 2. Draw crisp 1-bit Porto Tech Hub Conference 26 logo header if enabled
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
   * Renders a display-only simulation of how the 1-bit receipt looks on real thermal paper.
   * Each printed dot spreads beyond its 0.125mm cell (heat bleed), so dithered midtones merge
   * and come out darker than the crisp pixel preview. The print canvas is never modified.
   *
   * @param spread Printed dot diameter relative to the dot pitch (1 = no bleed).
   */
  renderPaperSimulation(source: HTMLCanvasElement, target: HTMLCanvasElement, spread = PAPER_DOT_SPREAD): void {
    const srcCtx = source.getContext('2d');
    const dstCtx = target.getContext('2d');
    if (!srcCtx || !dstCtx) return;

    const SCALE = 3;
    const w = source.width;
    const h = source.height;
    const W = w * SCALE;
    const H = h * SCALE;
    target.width = W;
    target.height = H;

    const src = srcCtx.getImageData(0, 0, w, h).data;
    const ink = new Uint8Array(W * H);

    // Disc stamp around the dot centre, in output pixels
    const radius = (spread * SCALE) / 2;
    const reach = Math.ceil(radius);
    const centre = (SCALE - 1) / 2;
    const stamp: [number, number][] = [];
    for (let dy = -reach; dy <= reach + SCALE; dy++) {
      for (let dx = -reach; dx <= reach + SCALE; dx++) {
        const ox = dx - centre;
        const oy = dy - centre;
        if (ox * ox + oy * oy <= radius * radius) stamp.push([dx, dy]);
      }
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const isBlack = src[i + 3] >= 128 && 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2] < 128;
        if (!isBlack) continue;
        const baseX = x * SCALE;
        const baseY = y * SCALE;
        for (const [dx, dy] of stamp) {
          const px = baseX + dx;
          const py = baseY + dy;
          if (px >= 0 && px < W && py >= 0 && py < H) ink[py * W + px] = 1;
        }
      }
    }

    const out = dstCtx.createImageData(W, H);
    const o = out.data;
    for (let p = 0; p < W * H; p++) {
      const j = p * 4;
      if (ink[p]) {
        o[j] = 30; o[j + 1] = 29; o[j + 2] = 34; // thermal black (slightly blue-grey)
      } else {
        o[j] = 248; o[j + 1] = 246; o[j + 2] = 240; // receipt paper
      }
      o[j + 3] = 255;
    }
    dstCtx.putImageData(out, 0, 0);
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
