const TEXT_FILE = /\.(?:txt|md|markdown|json|csv)$/i;

export type LocalTextImport = { title: string; content: string };

export function localFilePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name || "未命名文件";
}

export async function readLocalTextFiles(files: File[]): Promise<{ items: LocalTextImport[]; skipped: number }> {
  const selected = files.slice(0, 50);
  const items: LocalTextImport[] = [];
  let skipped = files.length - selected.length;
  for (const file of selected) {
    if (!TEXT_FILE.test(file.name) || file.size > 500_000) { skipped += 1; continue; }
    const content = (await file.text()).replace(/\r\n?/g, "\n").trim();
    if (!content || content.length > 20_000) { skipped += 1; continue; }
    items.push({ title: localFilePath(file).slice(-120), content });
  }
  return { items, skipped };
}
