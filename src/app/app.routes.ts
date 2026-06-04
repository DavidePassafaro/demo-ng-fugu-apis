import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'apis',
    loadComponent: () => import('./shared/components/apis-layout/apis-layout').then((m) => m.ApisLayout),
    children: [
      {
        path: 'clipboard',
        loadComponent: () => import('./pages/apis/clipboard/clipboard').then((m) => m.Clipboard),
      },
      {
        path: '**',
        redirectTo: 'clipboard',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
