import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'raffle-join',
    loadComponent: () => import('./pages/raffle-join/raffle-join').then((m) => m.RaffleJoin),
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
        path: 'web-bluetooth',
        loadComponent: () => import('./pages/apis/web-bluetooth/web-bluetooth').then((m) => m.WebBluetooth),
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/apis/web-bluetooth/connect/web-bluetooth-connect').then(
                (m) => m.WebBluetoothConnect,
              ),
          },
          {
            path: 'printer',
            data: { transport: 'bluetooth' },
            loadComponent: () =>
              import('./pages/apis/web-bluetooth/printer/web-bluetooth-printer').then(
                (m) => m.WebBluetoothPrinter,
              ),
          },
          {
            path: 'raffle',
            loadComponent: () =>
              import('./pages/apis/web-bluetooth/raffle/web-bluetooth-raffle').then(
                (m) => m.WebBluetoothRaffle,
              ),
          },
        ],
      },
      {
        // Same photo booth + raffle as Web Bluetooth, over the printer's USB cable
        path: 'web-usb',
        loadComponent: () => import('./pages/apis/web-usb/web-usb').then((m) => m.WebUsb),
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/apis/web-usb/connect/web-usb-connect').then((m) => m.WebUsbConnect),
          },
          {
            path: 'printer',
            data: { transport: 'usb' },
            loadComponent: () =>
              import('./pages/apis/web-bluetooth/printer/web-bluetooth-printer').then(
                (m) => m.WebBluetoothPrinter,
              ),
          },
          {
            path: 'raffle',
            loadComponent: () =>
              import('./pages/apis/web-bluetooth/raffle/web-bluetooth-raffle').then(
                (m) => m.WebBluetoothRaffle,
              ),
          },
        ],
      },
      {
        path: 'badging',
        loadComponent: () => import('./pages/apis/badging/badging').then((m) => m.Badging),
      },
      {
        path: 'contact-picker',
        loadComponent: () => import('./pages/apis/contact-picker/contact-picker').then((m) => m.ContactPicker),
      },
      {
        path: 'screen-wake-lock',
        loadComponent: () => import('./pages/apis/screen-wake-lock/screen-wake-lock').then((m) => m.ScreenWakeLock),
      },
      {
        path: 'picture-in-picture',
        loadComponent: () => import('./pages/apis/picture-in-picture/picture-in-picture').then((m) => m.PictureInPicture),
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
