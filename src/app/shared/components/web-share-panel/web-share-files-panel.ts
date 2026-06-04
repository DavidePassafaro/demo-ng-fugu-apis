import { Component, computed, input, output, signal } from '@angular/core';

interface FileEntry {
  file: File;
  sizeLabel: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

@Component({
  selector: 'app-web-share-files-panel',
  imports: [],
  templateUrl: './web-share-files-panel.html',
  styleUrl: './web-share-panel.scss',
})
export class WebShareFilesPanel {
  readonly supportsFileShare = input.required<boolean>();
  readonly share = output<File[]>();

  protected readonly entries = signal<FileEntry[]>([]);
  protected readonly canSubmit = computed(() => this.entries().length > 0);

  protected feedback = signal('');
  protected feedbackType = signal<'success' | 'error'>('success');

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.entries.set(files.map((file) => ({ file, sizeLabel: formatSize(file.size) })));
    this.feedback.set('');
  }

  protected removeFile(index: number): void {
    this.entries.update((list) => list.filter((_, i) => i !== index));
  }

  protected onShare(): void {
    this.share.emit(this.entries().map((e) => e.file));
  }

  showSuccess(): void {
    this.feedbackType.set('success');
    this.feedback.set('✓ Share dialog opened successfully!');
    setTimeout(() => this.feedback.set(''), 3000);
  }

  showError(message: string): void {
    this.feedbackType.set('error');
    this.feedback.set(`✗ ${message}`);
  }
}
