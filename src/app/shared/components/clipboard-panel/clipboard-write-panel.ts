import { Component, input, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipboardWritePayload } from '../../model/clipboard.types';
import { output } from '@angular/core';

type WriteTab = 'text' | 'html' | 'image';

const TABS: { id: WriteTab; label: string; description: string }[] = [
  { id: 'text', label: 'Text', description: 'writeText()' },
  { id: 'html', label: 'HTML', description: 'write()' },
  { id: 'image', label: 'Image', description: 'write()' },
];

@Component({
  selector: 'app-clipboard-write-panel',
  imports: [FormsModule],
  templateUrl: './clipboard-write-panel.html',
  styleUrl: './clipboard-panel.scss',
})
export class ClipboardWritePanel {
  readonly supportsRichContent = input.required<boolean>();
  readonly write = output<ClipboardWritePayload>();

  protected readonly tabs = TABS;
  protected readonly activeTab = signal<WriteTab>('text');

  protected readonly textValue = signal('');
  protected readonly htmlValue = signal('');
  protected readonly imageFile = signal<File | null>(null);
  protected readonly imagePreviewUrl = signal<string | null>(null);

  protected readonly canSubmit = computed(() => {
    switch (this.activeTab()) {
      case 'text': return this.textValue().trim().length > 0;
      case 'html': return this.htmlValue().trim().length > 0;
      case 'image': return this.imageFile() !== null;
    }
  });

  protected readonly isTabDisabled = computed(() => !this.supportsRichContent());

  protected feedback = signal('');
  protected feedbackType = signal<'success' | 'error'>('success');

  protected selectTab(tab: WriteTab): void {
    if ((tab === 'html' || tab === 'image') && !this.supportsRichContent()) return;
    this.activeTab.set(tab);
    this.feedback.set('');
  }

  protected onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (this.imagePreviewUrl()) {
      URL.revokeObjectURL(this.imagePreviewUrl()!);
    }
    this.imageFile.set(file);
    this.imagePreviewUrl.set(file ? URL.createObjectURL(file) : null);
  }

  protected onWrite(): void {
    const tab = this.activeTab();
    if (tab === 'text') {
      this.write.emit({ kind: 'text', value: this.textValue() });
    } else if (tab === 'html') {
      this.write.emit({ kind: 'html', value: this.htmlValue() });
    } else if (tab === 'image' && this.imageFile()) {
      this.write.emit({ kind: 'image', blob: this.imageFile()! });
    }
  }

  showSuccess(): void {
    this.feedbackType.set('success');
    this.feedback.set('✓ Content copied to clipboard!');
    setTimeout(() => this.feedback.set(''), 2500);
  }

  showError(message: string): void {
    this.feedbackType.set('error');
    this.feedback.set(`✗ ${message}`);
  }
}
