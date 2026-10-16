import type { ArchiveData, EntryData } from './api.js';

export function dateLabel(unix: number, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }) {
  return new Date(unix * 1000).toLocaleDateString(undefined, options);
}
export function groupThoughts(entries: EntryData[]) {
  const groups: { key: string; label: string; entries: EntryData[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.created_at * 1000);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = groups.at(-1);
    if (group?.key !== key) { group = { key, label: dateLabel(entry.created_at, { month: 'long', year: 'numeric' }), entries: [] }; groups.push(group); }
    group.entries.push(entry);
  }
  return groups;
}
export function archiveMarkdown(archive: ArchiveData) {
  const lines = ['# Lacuna', '', `Exported ${archive.exported_at}`, '', '## Your words', ''];
  for (const entry of archive.entries) lines.push(`### ${dateLabel(entry.created_at)}${entry.kept_at ? ' · Kept close' : ''}`, '', entry.body, '');
  if (archive.memoirs.length) lines.push('## Living memoir editions', '', 'Generated reflections, shaped from your entries.', '');
  for (const edition of archive.memoirs) lines.push(`### ${dateLabel(edition.generated_at)}`, '', edition.prose, '');
  return lines.join('\n');
}
export function downloadFile(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
