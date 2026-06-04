export interface FsFileResult {
  name: string;
  mimeType: string;
  sizeLabel: string;
  content: string;
  truncated: boolean;
}

export interface FsDirEntry {
  name: string;
  kind: 'file' | 'directory';
}
