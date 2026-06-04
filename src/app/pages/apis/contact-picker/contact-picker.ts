import { Component, OnInit, signal } from '@angular/core';

const ALL_PROPERTIES: ContactProperty[] = ['name', 'email', 'tel', 'address', 'icon'];

const PROPERTY_LABELS: Record<ContactProperty, { label: string; icon: string }> = {
  name:    { label: 'Name',    icon: '👤' },
  email:   { label: 'Email',   icon: '✉️' },
  tel:     { label: 'Phone',   icon: '📞' },
  address: { label: 'Address', icon: '🏠' },
  icon:    { label: 'Avatar',  icon: '🖼️' },
};

export interface PickedContact {
  name?: string[];
  email?: string[];
  tel?: string[];
  address?: ContactAddress[];
  avatarUrl?: string;
}

@Component({
  selector: 'app-contact-picker',
  templateUrl: './contact-picker.html',
  styleUrl: './contact-picker.scss',
})
export class ContactPicker implements OnInit {
  readonly isSupported = 'contacts' in navigator && 'ContactsManager' in window;

  readonly allProperties = ALL_PROPERTIES;
  readonly propertyLabels = PROPERTY_LABELS;

  /** Properties the browser actually supports (subset of ALL_PROPERTIES). */
  readonly supportedProperties = signal<ContactProperty[]>([]);

  /** Properties the user has selected to request. */
  readonly selectedProperties = signal<Set<ContactProperty>>(new Set(['name', 'email', 'tel']));

  readonly multiple = signal(true);

  readonly contacts = signal<PickedContact[]>([]);
  readonly error = signal('');
  readonly picked = signal(false);

  async ngOnInit(): Promise<void> {
    if (!this.isSupported) return;
    try {
      const props = await navigator.contacts!.getProperties();
      this.supportedProperties.set(props);
      // Keep only supported ones in the initial selection
      this.selectedProperties.update(
        (sel) => new Set([...sel].filter((p) => props.includes(p))),
      );
    } catch {
      // getProperties can fail on some browsers — silently ignore
    }
  }

  toggleProperty(prop: ContactProperty): void {
    this.selectedProperties.update((sel) => {
      const next = new Set(sel);
      next.has(prop) ? next.delete(prop) : next.add(prop);
      return next;
    });
  }

  isSelected(prop: ContactProperty): boolean {
    return this.selectedProperties().has(prop);
  }

  isPropertySupported(prop: ContactProperty): boolean {
    const supported = this.supportedProperties();
    // If we haven't loaded supported props yet, assume all are available
    return supported.length === 0 || supported.includes(prop);
  }

  async pickContacts(): Promise<void> {
    this.error.set('');
    const props = [...this.selectedProperties()];
    if (props.length === 0) {
      this.error.set('Select at least one property to request.');
      return;
    }

    try {
      const results = await navigator.contacts!.select(props, { multiple: this.multiple() });
      const picked: PickedContact[] = await Promise.all(
        results.map(async (c) => {
          const contact: PickedContact = {
            name: c.name,
            email: c.email,
            tel: c.tel,
            address: c.address,
          };
          if (c.icon?.[0]) {
            contact.avatarUrl = URL.createObjectURL(c.icon[0]);
          }
          return contact;
        }),
      );
      this.contacts.set(picked);
      this.picked.set(true);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return; // user cancelled
      this.error.set(err instanceof Error ? err.message : 'Failed to pick contacts.');
    }
  }

  formatAddress(addr: ContactAddress): string {
    return [addr.recipient, addr.addressLine?.join(', '), addr.city, addr.region, addr.postalCode, addr.country]
      .filter(Boolean)
      .join(', ');
  }
}
