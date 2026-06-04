import { Component, output, signal } from '@angular/core';
import { FsDirEntry } from '../../model/file-system.types';

@Component({
  selector: 'app-fs-dir-panel',
  imports: [],
  templateUrl: './fs-dir-panel.html',
  styleUrl: './fs-panel.scss',
})
export class FsDirPanel {
  readonly open = output<void>();

  protected dirName = signal('');
  protected entries = signal<FsDirEntry[]>([]);
  protected error = signal('');
  protected hasOpened = signal(false);

  protected readonly fileCount = () => this.entries().filter((e) => e.kind === 'file').length;
  protected readonly dirCount = () => this.entries().filter((e) => e.kind === 'directory').length;

  protected onOpen(): void {
    this.error.set('');
    this.open.emit();
  }

  showEntries(dirName: string, entries: FsDirEntry[]): void {
    this.dirName.set(dirName);
    this.entries.set(entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    }));
    this.error.set('');
    this.hasOpened.set(true);
  }

  showError(message: string): void {
    this.error.set(message);
    this.entries.set([]);
    this.hasOpened.set(true);
  }
}
