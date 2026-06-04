import { Component, output, signal } from '@angular/core';
import { ClipboardReadItem } from '../../model/clipboard.types';

@Component({
  selector: 'app-clipboard-read-panel',
  imports: [],
  templateUrl: './clipboard-read-panel.html',
  styleUrl: './clipboard-panel.scss',
})
export class ClipboardReadPanel {
  readonly read = output<void>();

  protected results = signal<ClipboardReadItem[]>([]);
  protected error = signal('');
  protected hasRead = signal(false);

  protected onRead(): void {
    this.results.set([]);
    this.hasRead.set(false);
    this.error.set('');
    this.read.emit();
  }

  showResults(items: ClipboardReadItem[]): void {
    this.results.set(items);
    this.error.set('');
    this.hasRead.set(true);
  }

  showError(message: string): void {
    this.error.set(message);
    this.results.set([]);
    this.hasRead.set(true);
  }
}
