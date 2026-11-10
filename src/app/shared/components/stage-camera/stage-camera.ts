import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { WebHidService } from '../../../pages/apis/web-hid/web-hid.service';
import { WebBluetoothService } from '../../../pages/apis/web-bluetooth/web-bluetooth.service';
import { WebUsbPrinterService } from '../../../pages/apis/web-usb/web-usb-printer.service';
import { GamepadConnectionService } from '../../../pages/apis/gamepad/gamepad-connection.service';

interface FrameRect {
  x: number;
  y: number;
  width: number;
}

type Gesture =
  | { kind: 'move'; pointerId: number; startX: number; startY: number; origin: FrameRect }
  | { kind: 'resize'; pointerId: number; startX: number; origin: FrameRect };

const STORAGE_KEY = 'stage-camera';
const MIN_WIDTH = 160;
const MARGIN = 16;

/**
 * Floating, draggable webcam preview used on stage to show the physical device
 * (tablet, printer, gamepad…) to the audience. It only exists on device pages while a device
 * is connected, and releases the camera as soon as that is no longer true.
 */
@Component({
  selector: 'app-stage-camera',
  templateUrl: './stage-camera.html',
  styleUrl: './stage-camera.scss',
  host: {
    '(window:resize)': 'clampToViewport()',
  },
})
export class StageCamera {
  private readonly router = inject(Router);
  private readonly hid = inject(WebHidService);
  private readonly bluetooth = inject(WebBluetoothService);
  private readonly usb = inject(WebUsbPrinterService);
  private readonly gamepad = inject(GamepadConnectionService);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** True only on a device page whose device is currently connected. */
  readonly visible = computed(() => {
    const url = this.url();
    if (url.startsWith('/apis/web-hid')) return this.hid.isTabletConnected();
    if (url.startsWith('/apis/web-bluetooth')) return this.bluetooth.isPrinterConnected();
    if (url.startsWith('/apis/web-usb')) return this.usb.isConnected();
    if (url.startsWith('/apis/gamepad')) return this.gamepad.isConnected();
    return false;
  });

  readonly open = signal(false);
  readonly mirrored = signal(false);
  readonly cameras = signal<MediaDeviceInfo[]>([]);
  /** Camera requested by the user ('' = browser default). Drives the stream. */
  readonly cameraId = signal<string>('');
  /** Camera actually in use, shown in the picker. */
  readonly activeCameraId = signal<string>('');
  readonly error = signal('');
  readonly stream = signal<MediaStream | null>(null);

  /** Video aspect ratio (width / height), updated from the stream metadata. */
  readonly aspect = signal(4 / 3);
  readonly rect = signal<FrameRect | null>(null);
  readonly height = computed(() => Math.round((this.rect()?.width ?? 0) / this.aspect()));

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private gesture: Gesture | null = null;
  private streamToken = 0;

  constructor() {
    this.restoreSettings();

    // Start/stop the camera following visibility, open state and selected camera
    effect(() => {
      const shouldStream = this.visible() && this.open();
      const id = this.cameraId();
      untracked(() => (shouldStream ? void this.startStream(id) : this.stopStream()));
    });

    // Collapse back to the button whenever the widget disappears
    effect(() => {
      if (!this.visible()) untracked(() => this.open.set(false));
    });

    // Attach the stream to the <video> once both exist
    effect(() => {
      const video = this.video()?.nativeElement;
      const stream = this.stream();
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        if (stream) video.play().catch(() => undefined);
      }
    });

    effect(() => {
      const settings = { cameraId: this.cameraId(), mirrored: this.mirrored(), rect: this.rect() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        /* storage unavailable: settings just won't persist */
      }
    });

    inject(DestroyRef).onDestroy(() => this.stopStream());
  }

  show(): void {
    if (!this.rect()) {
      const width = Math.min(360, window.innerWidth - MARGIN * 2);
      this.rect.set({
        x: window.innerWidth - width - MARGIN,
        y: window.innerHeight - width / this.aspect() - MARGIN,
        width,
      });
    }
    this.open.set(true);
    this.clampToViewport();
  }

  hide(): void {
    this.open.set(false);
  }

  selectCamera(id: string): void {
    this.cameraId.set(id);
  }

  onMetadata(video: HTMLVideoElement): void {
    if (video.videoWidth && video.videoHeight) {
      this.aspect.set(video.videoWidth / video.videoHeight);
      this.clampToViewport();
    }
  }

  // ── Drag & resize ──────────────────────────────────────────────────────

  startMove(event: PointerEvent): void {
    const rect = this.rect();
    if (!rect || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, select, .resize-handle')) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.gesture = {
      kind: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: rect,
    };
  }

  startResize(event: PointerEvent): void {
    const rect = this.rect();
    if (!rect || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.gesture = {
      kind: 'resize',
      pointerId: event.pointerId,
      startX: event.clientX,
      origin: rect,
    };
  }

  onPointerMove(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.startX;
    if (g.kind === 'move') {
      const dy = event.clientY - g.startY;
      this.rect.set(this.clamp({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy }));
    } else {
      const maxWidth = window.innerWidth - g.origin.x;
      const width = Math.max(MIN_WIDTH, Math.min(g.origin.width + dx, maxWidth));
      this.rect.set(this.clamp({ ...g.origin, width }));
    }
  }

  endGesture(event: PointerEvent): void {
    if (this.gesture?.pointerId === event.pointerId) this.gesture = null;
  }

  /** Nudge / resize with the keyboard: arrows move, +/- resize. */
  onKeydown(event: KeyboardEvent): void {
    const rect = this.rect();
    if (!rect || (event.target as HTMLElement).closest('select')) return;
    const step = event.shiftKey ? 40 : 10;
    const next = { ...rect };
    switch (event.key) {
      case 'ArrowLeft':
        next.x -= step;
        break;
      case 'ArrowRight':
        next.x += step;
        break;
      case 'ArrowUp':
        next.y -= step;
        break;
      case 'ArrowDown':
        next.y += step;
        break;
      case '+':
      case '=':
        next.width += step;
        break;
      case '-':
        next.width = Math.max(MIN_WIDTH, next.width - step);
        break;
      default:
        return;
    }
    event.preventDefault();
    this.rect.set(this.clamp(next));
  }

  clampToViewport(): void {
    const rect = this.rect();
    if (rect) this.rect.set(this.clamp(rect));
  }

  private clamp(rect: FrameRect): FrameRect {
    const width = Math.max(MIN_WIDTH, Math.min(rect.width, window.innerWidth));
    const height = width / this.aspect();
    return {
      width,
      x: Math.round(Math.max(0, Math.min(rect.x, window.innerWidth - width))),
      y: Math.round(Math.max(0, Math.min(rect.y, window.innerHeight - height))),
    };
  }

  // ── Camera ─────────────────────────────────────────────────────────────

  private async startStream(cameraId: string): Promise<void> {
    this.stopStream();
    const token = ++this.streamToken;
    this.error.set('');

    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Camera API not available in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (token !== this.streamToken) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream.set(stream);
      await this.refreshCameras(stream);
    } catch (err) {
      if (token !== this.streamToken) return;
      // A remembered camera that is no longer plugged in: fall back to the default one
      if (cameraId && err instanceof DOMException && err.name === 'OverconstrainedError') {
        this.cameraId.set('');
        return;
      }
      this.error.set(err instanceof Error ? err.message : 'Could not access the camera.');
    }
  }

  private stopStream(): void {
    this.streamToken++;
    this.stream()
      ?.getTracks()
      .forEach((t) => t.stop());
    this.stream.set(null);
    this.activeCameraId.set('');
  }

  /** Labels are only exposed after permission is granted, so list cameras once streaming. */
  private async refreshCameras(stream: MediaStream): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.cameras.set(devices.filter((d) => d.kind === 'videoinput'));
    this.activeCameraId.set(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '');
  }

  private restoreSettings(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved?.cameraId) this.cameraId.set(saved.cameraId);
      if (saved?.mirrored) this.mirrored.set(true);
      if (saved?.rect?.width) this.rect.set(saved.rect);
    } catch {
      /* ignore corrupted or unavailable storage */
    }
  }
}
