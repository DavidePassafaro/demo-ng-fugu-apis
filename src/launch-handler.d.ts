// Global type declarations for the File Handling API (Launch Handler API)
// https://wicg.github.io/file-handling/

interface LaunchParams {
  readonly files: ReadonlyArray<FileSystemFileHandle>;
  readonly targetURL: string | null;
}

type LaunchConsumer = (params: LaunchParams) => void | Promise<void>;

interface LaunchQueue {
  setConsumer(consumer: LaunchConsumer): void;
}

// PWA install prompt
// https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface Window {
  readonly launchQueue: LaunchQueue;
  addEventListener(type: 'beforeinstallprompt', listener: (e: BeforeInstallPromptEvent) => void): void;
  removeEventListener(type: 'beforeinstallprompt', listener: (e: BeforeInstallPromptEvent) => void): void;
}
