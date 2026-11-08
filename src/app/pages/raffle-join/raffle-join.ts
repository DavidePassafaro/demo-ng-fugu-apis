import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
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

  private readonly participantId =
    'p_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
  private mediaStream: MediaStream | null = null;

  constructor() {
    const roomParam = this.route.snapshot.queryParamMap.get('room') || '';
    this.roomId.set(roomParam);

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

  ngOnDestroy(): void {
    this.stopLiveCamera();
  }
}
