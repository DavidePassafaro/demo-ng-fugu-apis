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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RaffleParticipant, RaffleService } from '../raffle.service';

type RafflePhase = 'lobby' | 'roulette' | 'winner';

interface ConfettiPiece {
  id: number;
  dx: number;
  dy: number;
  rot: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
}

const CONFETTI_COLORS = ['#6366f1', '#22c55e', '#eab308', '#ef4444', '#06b6d4', '#ec4899', '#f97316'];
const CONFETTI_COUNT = 160;
/** Number of photo swaps in the centre modal before landing on the winner. */
const ROULETTE_STEPS = 32;

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
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class WebBluetoothRaffle implements OnDestroy {
  protected readonly raffleService = inject(RaffleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  readonly phase = signal<RafflePhase>('lobby');
  readonly qrDataUrl = signal<string>('');
  readonly showUrlConfig = signal(false);
  readonly copiedLink = signal(false);

  /** Index of the currently highlighted participant card during the 'roulette' & 'winner' phases. */
  readonly activeSpotlightIndex = signal<number | null>(null);

  /** Selected winner after the roulette animation finishes. */
  readonly winner = signal<RaffleParticipant | null>(null);

  /** Participant currently shown in the centre modal during the roulette. */
  readonly spotlightParticipant = computed(() => {
    const idx = this.activeSpotlightIndex();
    return idx === null ? null : (this.raffleService.participants()[idx] ?? null);
  });

  readonly confetti = signal<ConfettiPiece[]>([]);

  private readonly printWinnerBtn = viewChild<ElementRef<HTMLButtonElement>>('printWinnerBtn');

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

    // Move focus to the main action when the winner modal appears
    effect(() => {
      this.printWinnerBtn()?.nativeElement.focus();
    });
  }

  onEscape(): void {
    if (this.phase() === 'winner') {
      this.backToLobby();
    }
  }

  /**
   * Starts the draw: locks entries, then a centre modal cycles through random
   * participant photos (slowing down) and lands on the winner with confetti.
   */
  startRaffleAnimation(): void {
    const list = this.raffleService.participants();
    if (list.length === 0) return;

    // Lock the room so no new participants can upload once the draw has started
    this.raffleService.lockEntries();

    this.clearTimers();
    this.winner.set(null);
    this.confetti.set([]);
    this.startRoulettePhase();
  }

  /**
   * Removes the winner from the raffle list and sends their photo and name
   * to the Thermal Printer workspace to configure and print the sticker.
   */
  configureAndPrintWinner(): void {
    const selected = this.winner();
    if (!selected) return;
    this.raffleService.removeParticipant(selected.id);
    this.raffleService.pendingWinner.set(selected);
    // Relative: back to the photo booth of the same transport (Bluetooth or USB)
    void this.router.navigate(['../printer'], { relativeTo: this.route });
  }

  /**
   * Returns to the QR code lobby while keeping existing participants.
   */
  backToLobby(): void {
    this.clearTimers();
    this.phase.set('lobby');
    this.winner.set(null);
    this.activeSpotlightIndex.set(null);
    this.confetti.set([]);
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
      this.animTimer = setTimeout(() => this.announceWinner(list[0]), 900);
      return;
    }

    let step = 0;
    let previous = -1;

    const tick = (): void => {
      let idx: number;
      if (step >= ROULETTE_STEPS) {
        idx = winnerIndex;
      } else {
        // Random photo, never the same twice in a row
        do {
          idx = Math.floor(Math.random() * list.length);
        } while (idx === previous);
      }
      previous = idx;
      this.activeSpotlightIndex.set(idx);

      if (step >= ROULETTE_STEPS) {
        this.animTimer = setTimeout(() => this.announceWinner(list[winnerIndex]), 700);
        return;
      }

      step++;
      const progress = step / ROULETTE_STEPS;
      const delay = Math.round(90 + Math.pow(progress, 2.6) * 520);
      this.animTimer = setTimeout(tick, delay);
    };

    tick();
  }

  private announceWinner(participant: RaffleParticipant): void {
    this.winner.set(participant);
    // Notify the phones: the winner sees "You won!", everyone else sees who won
    this.raffleService.announceWinner(participant);
    this.phase.set('winner');
    this.confetti.set(this.createConfetti());
  }

  /** Radial burst from the modal centre; each piece then falls with gravity (CSS). */
  private createConfetti(): ConfettiPiece[] {
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return [];

    return Array.from({ length: CONFETTI_COUNT }, (_, id) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 180 + Math.random() * 420;
      return {
        id,
        dx: Math.round(Math.cos(angle) * distance),
        dy: Math.round(Math.sin(angle) * distance * 0.75 - 120),
        rot: Math.round(360 + Math.random() * 900) * (Math.random() < 0.5 ? -1 : 1),
        delay: Math.round(Math.random() * 180),
        duration: Math.round(1600 + Math.random() * 1400),
        size: Math.round(8 + Math.random() * 8),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      };
    });
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
