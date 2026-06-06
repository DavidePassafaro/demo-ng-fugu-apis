import { Component, OnDestroy, afterNextRender, computed, signal, viewChild } from '@angular/core';
import { FileHandlingInstallPanel } from '../../../shared/components/file-handling-panel/file-handling-install-panel';
import { FileHandlingConsumerPanel } from '../../../shared/components/file-handling-panel/file-handling-consumer-panel';
import { ReceivedFile } from '../../../shared/model/file-handling.types';

const MAX_TEXT_CHARS = 4_000;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readFile(file: File, objectUrls: string[]): Promise<ReceivedFile> {
  const base = { name: file.name, mimeType: file.type, sizeLabel: formatSize(file.size) };

  if (file.type.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(file);
    objectUrls.push(objectUrl);
    return { ...base, displayType: 'image', objectUrl };
  }

  if (file.type.startsWith('text/') || file.type === 'application/json') {
    const raw = await file.text();
    return {
      ...base,
      displayType: 'text',
      textContent: raw.slice(0, MAX_TEXT_CHARS),
      truncated: raw.length > MAX_TEXT_CHARS,
    };
  }

  return { ...base, displayType: 'binary' };
}

@Component({
  selector: 'app-file-handling',
  imports: [FileHandlingInstallPanel, FileHandlingConsumerPanel],
  templateUrl: './file-handling.html',
  styleUrl: './file-handling.scss',
})
export class FileHandling implements OnDestroy {
  private readonly installPanel = viewChild(FileHandlingInstallPanel);
  private readonly consumerPanel = viewChild.required(FileHandlingConsumerPanel);

  readonly isSupported = 'launchQueue' in window;
  readonly isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  private readonly installPrompt = signal<BeforeInstallPromptEvent | null>(null);
  readonly canInstall = computed(() => !this.isStandalone && this.installPrompt() !== null);

  private readonly objectUrls: string[] = [];

  private readonly onBeforeInstallPrompt = (e: BeforeInstallPromptEvent): void => {
    e.preventDefault();
    this.installPrompt.set(e);
  };

  constructor() {
    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);

    afterNextRender(() => {
      if (!this.isSupported) return;


      // 👇🏻👇🏻👇🏻
      window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files.length) return;
        try {
          const files: ReceivedFile[] = await Promise.all(
            launchParams.files.map((handle) =>
              handle.getFile().then((file) => readFile(file, this.objectUrls)),
            ),
          );
          this.consumerPanel().showFiles(files);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not read the launched files.';
          this.consumerPanel().showError(message);
        }
      });


    });
  }

  /**
   * Triggers the browser's PWA install prompt captured from the `beforeinstallprompt` event
   * and reports the user's outcome (accepted / dismissed) to the install panel.
   */
  async install(): Promise<void> {
    const prompt = this.installPrompt();
    if (!prompt) return;
    const { outcome } = await prompt.prompt();
    this.installPanel()?.showOutcome(outcome);
    this.installPrompt.set(null);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}
