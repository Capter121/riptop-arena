interface ClipboardWriter {
  writeText: (text: string) => Promise<void>;
}

export async function copyShareLink(url: string, clipboard: ClipboardWriter | undefined = navigator.clipboard): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
