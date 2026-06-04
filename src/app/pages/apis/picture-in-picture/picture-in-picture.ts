import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  signal,
  viewChild,
} from '@angular/core';

// A short, freely-licensed sample video (Big Buck Bunny excerpt via W3Schools)
const SAMPLE_VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

@Component({
  selector: 'app-picture-in-picture',
  templateUrl: './picture-in-picture.html',
  styleUrl: './picture-in-picture.scss',
})
export class PictureInPicture implements OnDestroy {
  readonly isVideoSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled;
  readonly isDocPipSupported = 'documentPictureInPicture' in window;

  // ── Video PiP ─────────────────────────────────────────────────────────────
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly videoSrc = signal(SAMPLE_VIDEO_URL);
  readonly isInVideoPip = signal(false);
  readonly videoError = signal('');

  private readonly onEnterPip = (): void => this.isInVideoPip.set(true);
  private readonly onLeavePip = (): void => this.isInVideoPip.set(false);

  constructor() {
    afterNextRender(() => {
      const video = this.videoRef()?.nativeElement;
      if (video) {
        video.addEventListener('enterpictureinpicture', this.onEnterPip);
        video.addEventListener('leavepictureinpicture', this.onLeavePip);
      }
    });
  }

  loadVideoFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    this.videoSrc.set(url);
  }

  async enterVideoPip(): Promise<void> {
    this.videoError.set('');
    const video = this.videoRef()?.nativeElement;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      await video.requestPictureInPicture();
    } catch (err) {
      this.videoError.set(err instanceof Error ? err.message : 'Could not enter Picture-in-Picture.');
    }
  }

  async exitVideoPip(): Promise<void> {
    this.videoError.set('');
    try {
      await document.exitPictureInPicture();
    } catch (err) {
      this.videoError.set(err instanceof Error ? err.message : 'Could not exit Picture-in-Picture.');
    }
  }

  // ── Document PiP ─────────────────────────────────────────────────────────
  readonly isDocPipOpen = signal(false);
  readonly docPipError = signal('');

  private docPipWindow: Window | null = null;

  async openDocumentPip(): Promise<void> {
    this.docPipError.set('');
    try {
      const pipWin = await window.documentPictureInPicture!.requestWindow({ width: 340, height: 200 });
      this.docPipWindow = pipWin;
      this.isDocPipOpen.set(true);

      // Copy app styles into the PiP window so it looks consistent
      for (const link of Array.from(document.styleSheets)) {
        try {
          if (link.href) {
            const el = pipWin.document.createElement('link');
            el.rel = 'stylesheet';
            el.href = link.href;
            pipWin.document.head.appendChild(el);
          }
        } catch { /* cross-origin sheets — skip */ }
      }

      // Inject content into the PiP window
      pipWin.document.body.style.cssText =
        'margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f0f1a;font-family:system-ui,sans-serif;';
      pipWin.document.body.innerHTML = this.buildDocPipContent();

      // Start the live clock inside the PiP window
      const tick = (): void => {
        const el = pipWin.document.getElementById('pip-time');
        if (el) el.textContent = new Date().toLocaleTimeString();
      };
      const interval = pipWin.setInterval(tick, 1000);
      tick();

      pipWin.addEventListener('pagehide', () => {
        pipWin.clearInterval(interval);
        this.isDocPipOpen.set(false);
        this.docPipWindow = null;
      });
    } catch (err) {
      this.docPipError.set(err instanceof Error ? err.message : 'Could not open Document PiP window.');
    }
  }

  closeDocumentPip(): void {
    this.docPipWindow?.close();
  }

  private buildDocPipContent(): string {
    return `
      <div style="text-align:center;color:#fff;padding:1.5rem;">
        <p style="margin:0 0 0.5rem;font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">
          Document Picture-in-Picture
        </p>
        <p id="pip-time" style="margin:0;font-size:2.5rem;font-weight:800;font-variant-numeric:tabular-nums;color:#a5b4fc;letter-spacing:-0.03em;">
          --:--:--
        </p>
        <p style="margin:0.5rem 0 0;font-size:0.75rem;color:#6b7280;">
          Arbitrary HTML — not just video!
        </p>
      </div>
    `;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  ngOnDestroy(): void {
    const video = this.videoRef()?.nativeElement;
    if (video) {
      video.removeEventListener('enterpictureinpicture', this.onEnterPip);
      video.removeEventListener('leavepictureinpicture', this.onLeavePip);
    }
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    this.docPipWindow?.close();
  }
}
