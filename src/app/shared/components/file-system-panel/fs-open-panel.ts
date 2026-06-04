import { Component, output, signal } from '@angular/core';
import { FsFileResult } from '../../model/file-system.types';

@Component({
  selector: 'app-fs-open-panel',
  imports: [],
  templateUrl: './fs-open-panel.html',
  styleUrl: './fs-panel.scss',
})
export class FsOpenPanel {
  readonly open = output<void>();

  protected result = signal<FsFileResult | null>(null);
  protected error = signal('');

  protected onOpen(): void {
    this.error.set('');
    this.open.emit();
  }

  showFile(file: FsFileResult): void {
    this.result.set(file);
    this.error.set('');
  }

  showError(message: string): void {
    this.error.set(message);
    this.result.set(null);
  }
}
