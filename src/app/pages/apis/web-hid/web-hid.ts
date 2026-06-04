import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebHidService } from '../../../shared/services/web-hid.service';

@Component({
  selector: 'app-web-hid',
  imports: [RouterOutlet],
  templateUrl: './web-hid.html',
  styleUrl: './web-hid.scss',
})
export class WebHid {
  readonly hidService = inject(WebHidService);
}
