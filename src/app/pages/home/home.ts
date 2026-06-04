import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FUGU_APIS, FuguApi } from '../../fugu-apis.config';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  readonly apis: FuguApi[] = FUGU_APIS;
}
