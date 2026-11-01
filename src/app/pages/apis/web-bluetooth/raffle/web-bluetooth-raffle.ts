import {
  Component,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { RaffleParticipant, RaffleService } from '../raffle.service';

type RafflePhase = 'lobby' | 'revealing' | 'roulette' | 'winner';

const QR_ESM_CDN = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';

const DEMO_NAMES = [
  'Marco Rossi',
  'Sofia Almeida',
  'Tiago Ferreira',
  'Elena Conti',
  'Diogo Santos',
  'Beatriz Costa',
  'Luca Bianchi',
  'Inês Oliveira',
];

@Component({
  selector: 'app-web-bluetooth-raffle',
  imports: [RouterLink],
  templateUrl: './web-bluetooth-raffle.html',
  styleUrl: './web-bluetooth-raffle.scss',
})
export class WebBluetoothRaffle implements OnDestroy {
  protected readonly raffleService = inject(RaffleService);
  private readonly router = inject(Router);

  readonly phase = signal<RafflePhase>('lobby');
  readonly qrDataUrl = signal<string>('');
  readonly showUrlConfig = signal(false);
  readonly copiedLink = signal(false);

  /** Number of participant photos revealed so far during the 'revealing' phase. */
  readonly revealedCount = signal(0);

  /** Index of the currently highlighted participant card during the 'roulette' & 'winner' phases. */
  readonly activeSpotlightIndex = signal<number | null>(null);

  /** Selected winner after the roulette animation finishes. */
  readonly winner = signal<RaffleParticipant | null>(null);

  readonly visibleParticipants = computed(() =>
    this.raffleService.participants().slice(0, this.revealedCount()),
  );

  private animTimer: ReturnType<typeof setTimeout> | null = null;
  private demoCounter = 0;

  constructor() {
    afterNextRender(() => {
      this.raffleService.connectToRoom(this.raffleService.roomId(), true);
    });

    effect(() => {
      const url = this.raffleService.joinUrl();
      void this.generateQrCode(url);
    });
  }

  /**
   * Starts the two-stage raffle animation:
   * 1) Reveals each participant's photo one by one.
   * 2) Runs an easing roulette spotlight across all cards and picks a random winner.
   */
  startRaffleAnimation(): void {
    const list = this.raffleService.participants();
    if (list.length === 0) return;

    this.clearTimers();
    this.winner.set(null);
    this.activeSpotlightIndex.set(null);
    this.revealedCount.set(0);
    this.phase.set('revealing');

    const revealNext = (): void => {
      const current = this.revealedCount();
      const total = this.raffleService.participants().length;
      if (current < total) {
        this.revealedCount.set(current + 1);
        this.animTimer = setTimeout(revealNext, 480);
      } else {
        this.animTimer = setTimeout(() => this.startRoulettePhase(), 650);
      }
    };

    this.animTimer = setTimeout(revealNext, 250);
  }

  /**
   * Sends the winner's photo and name to the Thermal Printer workspace
   * so the speaker can configure dithering/brightness/contrast and print the sticker.
   */
  configureAndPrintWinner(): void {
    const selected = this.winner();
    if (!selected) return;
    this.raffleService.pendingWinner.set(selected);
    void this.router.navigate(['/apis/web-bluetooth/printer']);
  }

  /**
   * Returns to the QR code lobby while keeping existing participants.
   */
  backToLobby(): void {
    this.clearTimers();
    this.phase.set('lobby');
    this.winner.set(null);
    this.activeSpotlightIndex.set(null);
  }

  /**
   * Adds a simulated participant with a generated portrait graphic to test the animation.
   */
  addDemoParticipant(): void {
    const name = DEMO_NAMES[this.demoCounter % DEMO_NAMES.length];
    this.demoCounter++;
    const photoDataUrl = this.createDemoAvatarDataUrl(name, this.demoCounter);
    this.raffleService.addParticipant({
      id: 'demo-' + Date.now() + '-' + this.demoCounter,
      name,
      photoDataUrl,
      timestamp: Date.now(),
    });
  }

  copyJoinUrl(): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(this.raffleService.joinUrl());
      this.copiedLink.set(true);
      setTimeout(() => this.copiedLink.set(false), 1800);
    }
  }

  private startRoulettePhase(): void {
    const list = this.raffleService.participants();
    if (list.length === 0) return;

    this.phase.set('roulette');
    const winnerIndex = Math.floor(Math.random() * list.length);

    if (list.length === 1) {
      this.activeSpotlightIndex.set(0);
      this.animTimer = setTimeout(() => {
        this.winner.set(list[0]);
        this.phase.set('winner');
      }, 700);
      return;
    }

    const minLoops = 3;
    const totalSteps = minLoops * list.length + winnerIndex;
    let step = 0;

    const tick = (): void => {
      const idx = step % list.length;
      this.activeSpotlightIndex.set(idx);

      if (step >= totalSteps) {
        this.animTimer = setTimeout(() => {
          this.winner.set(list[winnerIndex]);
          this.phase.set('winner');
        }, 450);
        return;
      }

      step++;
      const progress = step / totalSteps;
      const delay = Math.round(65 + Math.pow(progress, 2.4) * 340);
      this.animTimer = setTimeout(tick, delay);
    };

    tick();
  }

  private async generateQrCode(url: string): Promise<void> {
    try {
      const mod = await import(/* @vite-ignore */ QR_ESM_CDN);
      const qrcode = mod.default ?? mod;
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const svgTag: string = qr.createSvgTag({ cellSize: 8, margin: 3, scalable: true });
      this.qrDataUrl.set('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTag));
    } catch {
      this.qrDataUrl.set(
        `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(url)}`,
      );
    }
  }

  private createDemoAvatarDataUrl(name: string, seed: number): string {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 288;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 384, 288);

    // Subtle radial background pattern for dithering preview
    const grad = ctx.createRadialGradient(192, 130, 20, 192, 144, 180);
    grad.addColorStop(0, '#f4f4f6');
    grad.addColorStop(1, '#bcbcc8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 384, 288);

    // Shoulders silhouette
    ctx.fillStyle = '#22222a';
    ctx.beginPath();
    ctx.ellipse(192, 295, 115, 78, 0, Math.PI, 0, false);
    ctx.fill();

    // Head circle
    ctx.fillStyle = '#d8d8e0';
    ctx.strokeStyle = '#18181f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(192, 122, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes & smile
    ctx.fillStyle = '#18181f';
    ctx.beginPath();
    ctx.arc(170, 112, 6, 0, Math.PI * 2);
    ctx.arc(214, 112, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(192, 126, 26, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // Small badge number
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`#${seed} ${name.split(' ')[0]}`, 192, 268);

    return canvas.toDataURL('image/jpeg', 0.85);
  }

  private clearTimers(): void {
    if (this.animTimer) {
      clearTimeout(this.animTimer);
      this.animTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }
}
