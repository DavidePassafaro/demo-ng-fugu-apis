import { Component, viewChild } from '@angular/core';
import { WebShareDataPanel } from '../../../shared/components/web-share-panel/web-share-data-panel';
import { WebShareFilesPanel } from '../../../shared/components/web-share-panel/web-share-files-panel';

@Component({
  selector: 'app-web-share',
  imports: [WebShareDataPanel, WebShareFilesPanel],
  templateUrl: './web-share.html',
  styleUrl: './web-share.scss',
})
export class WebShare {
  readonly isSupported = 'share' in navigator;
  readonly supportsFileShare = 'canShare' in navigator;

  private readonly dataPanel = viewChild.required(WebShareDataPanel);
  private readonly filesPanel = viewChild.required(WebShareFilesPanel);

  /**
   * Shares data using the Web Share API.
   * @param data {ShareData}
   */
  async shareData(data: ShareData): Promise<void> {
    try {
      await navigator.share(data);
      this.dataPanel().showSuccess();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'An error occurred while sharing.';
      this.dataPanel().showError(message);
    }
  }

  /**
   * Shares files using the Web Share API.
   * @param files {File[]}
   */
  async shareFiles(files: File[]): Promise<void> {
    try {
      const data: ShareData = { files };
      if (!navigator.canShare(data)) {
        this.filesPanel().showError('These files cannot be shared on this device or browser.');
        return;
      }
      await navigator.share(data);
      this.filesPanel().showSuccess();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'An error occurred while sharing.';
      this.filesPanel().showError(message);
    }
  }
}
