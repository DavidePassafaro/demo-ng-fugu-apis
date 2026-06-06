import { Component, OnDestroy, viewChild } from '@angular/core';
import { ClipboardWritePanel } from '../../../shared/components/clipboard-panel/clipboard-write-panel';
import { ClipboardReadPanel } from '../../../shared/components/clipboard-panel/clipboard-read-panel';
import { ClipboardWritePayload, ClipboardReadItem } from '../../../shared/model/clipboard.types';

@Component({
  selector: 'app-clipboard',
  templateUrl: './clipboard.html',
  styleUrl: './clipboard.scss',
  imports: [ClipboardWritePanel, ClipboardReadPanel],
})
export class Clipboard implements OnDestroy {
  private readonly writePanel = viewChild.required(ClipboardWritePanel);
  private readonly readPanel = viewChild.required(ClipboardReadPanel);

  readonly isSupported = 'clipboard' in navigator;
  readonly supportsRichContent = typeof ClipboardItem !== 'undefined';

  private readonly objectUrls: string[] = [];

  /**
   * Writes data to the clipboard based on the provided payload.
   * @param payload {ClipboardWritePayload}
   */
  async write(payload: ClipboardWritePayload): Promise<void> {
    try {
      switch (payload.kind) {
        case 'text':

          // 👇🏻👇🏻👇🏻
          await navigator.clipboard.writeText(payload.value);


          break;

        case 'html':

          // 👇🏻👇🏻👇🏻
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([payload.value], { type: 'text/html' }),
              'text/plain': new Blob([payload.value.replace(/<[^>]+>/g, '')], {
                type: 'text/plain',
              }),
            }),
          ]);


          break;

        case 'image':

          // 👇🏻👇🏻👇🏻
          await navigator.clipboard.write([
            new ClipboardItem({ [payload.blob.type]: payload.blob }),
          ]);


          break;
      }
      this.writePanel().showSuccess();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An error occurred while writing to the clipboard.';
      this.writePanel().showError(message);
    }
  }

  /**
   * Reads data from the clipboard and processes it into a displayable format.
   */
  async read(): Promise<void> {
    try {

      // 👇🏻👇🏻👇🏻
      const clipboardItems = await navigator.clipboard.read();


      const results: ClipboardReadItem[] = [];

      for (const item of clipboardItems) {
        for (const mimeType of item.types) {
          const blob = await item.getType(mimeType);

          if (mimeType === 'text/plain') {
            results.push({ mimeType, displayType: 'text', textValue: await blob.text() });
          } else if (mimeType === 'text/html') {
            results.push({ mimeType, displayType: 'html', textValue: await blob.text() });
          } else if (mimeType.startsWith('image/')) {
            const objectUrl = URL.createObjectURL(blob);
            this.objectUrls.push(objectUrl);
            results.push({ mimeType, displayType: 'image', objectUrl });
          } else {
            results.push({ mimeType, displayType: 'binary', size: blob.size });
          }
        }
      }

      this.readPanel().showResults(results);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An error occurred while reading the clipboard.';
      this.readPanel().showError(`Permission denied: ${message}`);
    }
  }

  ngOnDestroy(): void {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}
