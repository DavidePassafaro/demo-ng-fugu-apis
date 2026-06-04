import { Component, signal } from '@angular/core';
import { ReceivedFile } from '../../model/file-handling.types';

@Component({
  selector: 'app-file-handling-consumer-panel',
  imports: [],
  templateUrl: './file-handling-consumer-panel.html',
  styleUrl: './file-handling-panel.scss',
})
export class FileHandlingConsumerPanel {
  protected readonly files = signal<ReceivedFile[]>([]);
  protected readonly hasReceived = signal(false);
  protected readonly error = signal('');

  showFiles(files: ReceivedFile[]): void {
    this.files.set(files);
    this.hasReceived.set(true);
    this.error.set('');
  }

  showError(message: string): void {
    this.error.set(message);
    this.hasReceived.set(true);
  }
}
