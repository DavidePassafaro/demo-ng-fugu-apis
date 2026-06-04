import { Component, input, output, signal } from '@angular/core';

type InstallOutcome = 'accepted' | 'dismissed' | null;

@Component({
  selector: 'app-file-handling-install-panel',
  imports: [],
  templateUrl: './file-handling-install-panel.html',
  styleUrl: './file-handling-panel.scss',
})
export class FileHandlingInstallPanel {
  readonly isStandalone = input.required<boolean>();
  readonly canInstall = input.required<boolean>();
  readonly install = output<void>();

  protected outcome = signal<InstallOutcome>(null);

  protected onInstall(): void {
    this.install.emit();
  }

  showOutcome(outcome: 'accepted' | 'dismissed'): void {
    this.outcome.set(outcome);
  }
}
