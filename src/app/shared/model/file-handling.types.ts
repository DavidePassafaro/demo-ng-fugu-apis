export interface ReceivedFile {
  name: string;
  mimeType: string;
  sizeLabel: string;
  displayType: 'text' | 'image' | 'binary';
  textContent?: string;
  objectUrl?: string;
  truncated?: boolean;
}
