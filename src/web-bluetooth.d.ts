// Global type declarations for the Web Bluetooth API
// https://webbluetoothcg.github.io/web-bluetooth/

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;
type BluetoothDescriptorUUID = number | string;

interface BluetoothDataFilter {
  dataPrefix?: BufferSource;
  mask?: BufferSource;
}

interface BluetoothManufacturerDataFilter extends BluetoothDataFilter {
  companyIdentifier: number;
}

interface BluetoothServiceDataFilter extends BluetoothDataFilter {
  service: BluetoothServiceUUID;
}

interface BluetoothLEScanFilter {
  name?: string;
  namePrefix?: string;
  services?: BluetoothServiceUUID[];
  manufacturerData?: BluetoothManufacturerDataFilter[];
  serviceData?: BluetoothServiceDataFilter[];
}

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  exclusionFilters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
  optionalManufacturerData?: number[];
  acceptAllDevices?: boolean;
}

interface BluetoothCharacteristicProperties {
  readonly broadcast: boolean;
  readonly read: boolean;
  readonly writeWithoutResponse: boolean;
  readonly write: boolean;
  readonly notify: boolean;
  readonly indicate: boolean;
  readonly authenticatedSignedWrites: boolean;
  readonly reliableWrite: boolean;
  readonly writableAuxiliaries: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly service: BluetoothRemoteGATTService;
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  readonly value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
}

interface BluetoothRemoteGATTService extends EventTarget {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  readonly isPrimary: boolean;
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  watchAdvertisements(): Promise<void>;
  forget(): Promise<void>;
  addEventListener(type: 'gattserverdisconnected', listener: (event: Event) => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: (event: Event) => void): void;
}

interface Bluetooth extends EventTarget {
  getAvailability(): Promise<boolean>;
  getDevices(): Promise<BluetoothDevice[]>;
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  readonly bluetooth: Bluetooth;
}
