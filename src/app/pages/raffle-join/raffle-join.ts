import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RaffleService } from '../apis/web-bluetooth/raffle.service';
import { THERMAL_PRINT_WIDTH } from '../apis/web-bluetooth/thermal-printer-image.service';

@Component({
  selector: 'app-raffle-join',
  templateUrl: './raffle-join.html',
  styleUrl: './raffle-join.scss',
})
export class RaffleJoin implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  protected readonly raffleService = inject(RaffleService);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly roomId = signal('');
  readonly participantName = signal('');
  readonly photoDataUrl = signal('');
  readonly isCameraActive = signal(false);
  readonly isSubmitting = signal(false);
  readonly isSubmitted = signal(false);
  readonly error = signal('');

  /** Kept per room in localStorage so the phone still recognises its win after a reload. */
  private participantId = '';
  private mediaStream: MediaStream | null = null;

  /** Winner announced by the stage, and whether it's this phone. */
  readonly winner = this.raffleService.announcedWinner;
  readonly isWinner = computed(() => {
    const w = this.winner();
    return !!w && w.id === this.participantId;
  });

  readonly confetti = signal<{ id: number; left: number; delay: number; duration: number; color: string; drift: number }[]>([]);

  constructor() {
    const roomParam = this.route.snapshot.queryParamMap.get('room') || '';
    this.roomId.set(roomParam);
    this.participantId = this.loadParticipantId(roomParam);

    // Celebrate on the winner's phone: vibration (Android) + confetti
    effect(() => {
      if (!this.isWinner()) return;
      this.stopLiveCamera();
      navigator.vibrate?.([250, 120, 250, 120, 600]);
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) return;
      const colors = ['#6366f1', '#22c55e', '#eab308', '#ef4444', '#06b6d4', '#ec4899', '#f97316'];
      this.confetti.set(
        Array.from({ length: 90 }, (_, id) => ({
          id,
          left: Math.random() * 100,
          delay: Math.random() * 900,
          duration: 2200 + Math.random() * 1800,
          color: colors[Math.floor(Math.random() * colors.length)],
          drift: Math.round((Math.random() - 0.5) * 160),
        })),
      );
    });

    afterNextRender(() => {
      if (this.roomId()) {
        this.raffleService.connectToRoom(this.roomId(), false);
      }
    });
  }

  async startLiveCamera(): Promise<void> {
    this.error.set('');
    this.stopLiveCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Camera not available in this browser. Open this page in Chrome or Safari on your phone.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      this.mediaStream = stream;
      this.isCameraActive.set(true);

      setTimeout(() => {
        const video = this.videoRef()?.nativeElement;
        if (video) {
          video.srcObject = stream;
          void video.play();
        }
      }, 30);
    } catch {
      this.error.set('Could not access the camera: allow camera access for this page and try again.');
    }
  }

  stopLiveCamera(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
    this.isCameraActive.set(false);
  }

  snapFromLiveCamera(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video || !video.videoWidth) return;

    const width = THERMAL_PRINT_WIDTH;
    const aspect = video.videoHeight / video.videoWidth;
    const height = Math.max(160, Math.min(420, Math.round((width * aspect) / 8) * 8));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);

    this.photoDataUrl.set(canvas.toDataURL('image/jpeg', 0.78));
    this.stopLiveCamera();
  }

  async submitEntry(): Promise<void> {
    const name = this.participantName().trim();
    const photo = this.photoDataUrl();
    const room = this.roomId();

    if (!room) {
      this.error.set('Missing room code in URL. Please scan the QR code again.');
      return;
    }
    if (!name) {
      this.error.set('Please enter your name.');
      return;
    }
    if (!photo) {
      this.error.set('Please take or select a photo first.');
      return;
    }

    this.error.set('');
    this.isSubmitting.set(true);
    try {
      await this.raffleService.submitParticipantFromMobile(room, {
        id: this.participantId,
        name,
        photoDataUrl: photo,
        timestamp: Date.now(),
      });
      this.isSubmitted.set(true);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Could not send your photo. Please try again.',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private loadParticipantId(room: string): string {
    const fresh = 'p_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    if (!room) return fresh;
    const key = 'fugu_raffle_pid_' + room;
    try {
      const saved = localStorage.getItem(key);
      if (saved) return saved;
      localStorage.setItem(key, fresh);
    } catch {
      // Storage unavailable: the id lives only for this page load
    }
    return fresh;
  }

  ngOnDestroy(): void {
    this.stopLiveCamera();
  }
}
