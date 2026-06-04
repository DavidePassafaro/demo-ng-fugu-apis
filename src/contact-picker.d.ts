// Global type declarations for the Contact Picker API
// https://wicg.github.io/contact-api/spec/

type ContactProperty = 'address' | 'email' | 'icon' | 'name' | 'tel';

interface ContactAddress {
  readonly city: string;
  readonly country: string;
  readonly dependentLocality: string;
  readonly organization: string;
  readonly phone: string;
  readonly postalCode: string;
  readonly recipient: string;
  readonly region: string;
  readonly sortingCode: string;
  readonly addressLine: ReadonlyArray<string>;
  toJSON(): object;
}

interface ContactInfo {
  address?: ContactAddress[];
  email?: string[];
  icon?: Blob[];
  name?: string[];
  tel?: string[];
}

interface ContactsSelectOptions {
  multiple?: boolean;
}

interface ContactsManager {
  getProperties(): Promise<ContactProperty[]>;
  select(properties: ContactProperty[], options?: ContactsSelectOptions): Promise<ContactInfo[]>;
}

interface Navigator {
  readonly contacts?: ContactsManager;
}
