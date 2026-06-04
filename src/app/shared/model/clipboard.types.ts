export type ClipboardWritePayload =
  | { kind: 'text'; value: string }
  | { kind: 'html'; value: string }
  | { kind: 'image'; blob: Blob };

export interface ClipboardReadItem {
  mimeType: string;
  displayType: 'text' | 'html' | 'image' | 'binary';
  textValue?: string;
  objectUrl?: string;
  size?: number;
}
