import { Component, viewChild } from '@angular/core';
import { FsOpenPanel } from '../../../shared/components/file-system-panel/fs-open-panel';
import { FsSavePanel } from '../../../shared/components/file-system-panel/fs-save-panel';
import { FsDirPanel } from '../../../shared/components/file-system-panel/fs-dir-panel';
import { FsFileResult, FsDirEntry } from '../../../shared/model/file-system.types';

const MAX_PREVIEW_CHARS = 4_000;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

@Component({
  selector: 'app-file-system',
  imports: [FsOpenPanel, FsSavePanel, FsDirPanel],
  templateUrl: './file-system.html',
  styleUrl: './file-system.scss',
})
export class FileSystem {
  readonly isSupported = 'showOpenFilePicker' in window;

  private readonly openPanel = viewChild.required(FsOpenPanel);
  private readonly savePanel = viewChild.required(FsSavePanel);
  private readonly dirPanel = viewChild.required(FsDirPanel);

  async openFile(): Promise<void> {
    try {
      const [handle] = await window.showOpenFilePicker();
      const file = await handle.getFile();
      const rawContent = await file.text();

      const result: FsFileResult = {
        name: file.name,
        mimeType: file.type,
        sizeLabel: formatSize(file.size),
        content: rawContent.slice(0, MAX_PREVIEW_CHARS),
        truncated: rawContent.length > MAX_PREVIEW_CHARS,
      };

      this.openPanel().showFile(result);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Could not open the file.';
      this.openPanel().showError(message);
    }
  }

  async saveFile(content: string): Promise<void> {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'fugu-demo.txt',
        types: [{ description: 'Text files', accept: { 'text/plain': ['.txt'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();

      this.savePanel().showSuccess(handle.name);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Could not save the file.';
      this.savePanel().showError(message);
    }
  }

  async openDirectory(): Promise<void> {
    try {
      const dirHandle = await window.showDirectoryPicker();
      const entries: FsDirEntry[] = [];

      for await (const [name, handle] of dirHandle) {
        entries.push({ name, kind: handle.kind });
      }

      this.dirPanel().showEntries(dirHandle.name, entries);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Could not open the directory.';
      this.dirPanel().showError(message);
    }
  }
}
