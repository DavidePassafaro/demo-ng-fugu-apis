// Global type declarations for the Document Picture-in-Picture API
// https://wicg.github.io/document-picture-in-picture/

interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  readonly window: Window | null;
  addEventListener(type: 'enter', listener: (event: DocumentPictureInPictureEvent) => void): void;
  removeEventListener(type: 'enter', listener: (event: DocumentPictureInPictureEvent) => void): void;
}

interface DocumentPictureInPictureEvent extends Event {
  readonly window: Window;
}

interface Window {
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}
