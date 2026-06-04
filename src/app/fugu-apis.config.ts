export interface FuguApi {
  id: string;
  name: string;
  description: string;
  path: string;
  icon: string;
  available: boolean;
}

export const FUGU_APIS: FuguApi[] = [
  {
    id: 'clipboard',
    name: 'Clipboard API',
    description: 'Asynchronously read and write text and rich content to the system clipboard.',
    path: '/apis/clipboard',
    icon: '📋',
    available: true,
  },
  {
    id: 'web-share',
    name: 'Web Share API',
    description: 'Share text, URLs and files using the native OS share sheet.',
    path: '/apis/web-share',
    icon: '🔗',
    available: true,
  },
  {
    id: 'file-system',
    name: 'File System Access API',
    description: 'Open, read, modify and save files and directories directly from the local filesystem.',
    path: '/apis/file-system',
    icon: '📁',
    available: true,
  },
  {
    id: 'file-handling',
    name: 'File Handling API',
    description: 'Register the PWA as a file handler so the OS can open matching files directly into the app.',
    path: '/apis/file-handling',
    icon: '🗂️',
    available: true,
  },
  {
    id: 'gamepad',
    name: 'Gamepad API',
    description: 'Read real-time controller input and trigger haptic feedback via the Gamepad API.',
    path: '/apis/gamepad',
    icon: '🎮',
    available: true,
  },
  {
    id: 'badging',
    name: 'Badging API',
    description: 'Display a numeric badge on the installed PWA icon to notify the user.',
    path: '/apis/badging',
    icon: '🔔',
    available: false,
  },
  {
    id: 'contact-picker',
    name: 'Contact Picker API',
    description: 'Pick contacts from the device address book with explicit user permission.',
    path: '/apis/contact-picker',
    icon: '👤',
    available: false,
  },
  {
    id: 'screen-wake-lock',
    name: 'Screen Wake Lock API',
    description: 'Prevent the device from dimming or locking the screen while the application is in use.',
    path: '/apis/screen-wake-lock',
    icon: '💡',
    available: false,
  },
];
