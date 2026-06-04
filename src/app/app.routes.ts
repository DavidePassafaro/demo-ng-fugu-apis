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
        path: 'file-handling',
        loadComponent: () => import('./pages/apis/file-handling/file-handling').then((m) => m.FileHandling),
      },
      {
        path: 'web-share',
        loadComponent: () => import('./pages/apis/web-share/web-share').then((m) => m.WebShare),
      },
      {
        path: 'gamepad',
        loadComponent: () => import('./pages/apis/gamepad/gamepad').then((m) => m.GamepadPage),
      },
      {
        path: 'web-hid',
        loadComponent: () => import('./pages/apis/web-hid/web-hid').then((m) => m.WebHid),
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/apis/web-hid/connect/web-hid-connect').then((m) => m.WebHidConnect),
          },
          {
            path: 'tablet',
            loadComponent: () => import('./pages/apis/web-hid/tablet/web-hid-tablet').then((m) => m.WebHidTablet),
          },
        ],
      },
      {
        path: 'badging',
        loadComponent: () => import('./pages/apis/badging/badging').then((m) => m.Badging),
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
