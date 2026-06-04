import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-fs-save-panel',
  imports: [FormsModule],
  templateUrl: './fs-save-panel.html',
  styleUrl: './fs-panel.scss',
})
export class FsSavePanel {
  readonly save = output<string>();

  protected content = signal('Hello from the File System Access API!\n\nEdit this text and save it to your disk.');
  protected feedback = signal('');
  protected feedbackType = signal<'success' | 'error'>('success');

  protected onSave(): void {
    this.save.emit(this.content());
  }

  showSuccess(filename: string): void {
    this.feedbackType.set('success');
    this.feedback.set(`✓ Saved as "${filename}"`);
    setTimeout(() => this.feedback.set(''), 3000);
  }

  showError(message: string): void {
    this.feedbackType.set('error');
    this.feedback.set(`✗ ${message}`);
  }
}
