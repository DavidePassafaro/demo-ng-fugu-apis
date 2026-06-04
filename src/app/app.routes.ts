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
        path: 'file-system',
        loadComponent: () => import('./pages/apis/file-system/file-system').then((m) => m.FileSystem),
      },
      {
        path: 'web-share',
        loadComponent: () => import('./pages/apis/web-share/web-share').then((m) => m.WebShare),
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
