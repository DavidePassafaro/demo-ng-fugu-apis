import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FUGU_APIS, FuguApi } from '../../../fugu-apis.config';

@Component({
  selector: 'app-apis-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './apis-layout.html',
  styleUrl: './apis-layout.scss',
})
export class ApisLayout {
  readonly apis: FuguApi[] = FUGU_APIS.filter((api) => api.available);
}
