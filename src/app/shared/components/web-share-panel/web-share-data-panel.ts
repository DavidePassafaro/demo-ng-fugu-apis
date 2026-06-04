import { Component, computed, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-web-share-data-panel',
  imports: [FormsModule, JsonPipe],
  templateUrl: './web-share-data-panel.html',
  styleUrl: './web-share-panel.scss',
})
export class WebShareDataPanel {
  readonly share = output<ShareData>();

  protected readonly title = signal('');
  protected readonly text = signal('');
  protected readonly url = signal('');

  protected readonly canSubmit = computed(
    () =>
      this.title().trim().length > 0 ||
      this.text().trim().length > 0 ||
      this.url().trim().length > 0,
  );

  protected readonly preview = computed<ShareData>(() => {
    const data: ShareData = {};
    if (this.title().trim()) data.title = this.title().trim();
    if (this.text().trim()) data.text = this.text().trim();
    if (this.url().trim()) data.url = this.url().trim();
    return data;
  });

  protected feedback = signal('');
  protected feedbackType = signal<'success' | 'error'>('success');

  protected onShare(): void {
    this.share.emit(this.preview());
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
