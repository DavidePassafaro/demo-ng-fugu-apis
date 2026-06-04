import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FUGU_APIS, FuguApi, FuguApiConstraint } from '../../fugu-apis.config';

const CONSTRAINT_LABELS: Record<FuguApiConstraint, { label: string; icon: string; title: string }> = {
  'mobile-only': { label: 'Mobile only', icon: '📱', title: 'This API is only available on mobile devices' },
  'pwa-only': { label: 'PWA required', icon: '⚙️', title: 'The app must be installed as a PWA for this feature to work' },
  'device-required': { label: 'Device required', icon: '🔌', title: 'A physical device must be connected to use this API' },
};

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  readonly apis: FuguApi[] = FUGU_APIS;

  constraintMeta(c: FuguApiConstraint) {
    return CONSTRAINT_LABELS[c];
  }
}
