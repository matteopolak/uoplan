/**
 * One-shot: add `aliases` from existing component/description in catalogue.*.json
 * without re-scraping (same logic as {@link extractPreviouslyAliases} in scraper.ts).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../web/public/data');

function extractCourseCodes(text: string): string[] {
  const re = /\b([A-Z]{3,4})\s*(\d{4,5}[A-Z]?)\b/g;
  const codes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    codes.push(`${m[1]} ${m[2]}`.replace(/\s+/, ' '));
  }
  return Array.from(new Set(codes));
}

function normalizeCodeKey(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

function extractPreviouslyAliases(combined: string, ownCode: string): string[] {
  const normalized = combined.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const ownKey = normalizeCodeKey(ownCode);
  const re = /\b(?:Previously|Antérieurement)\s*:?\s*/gi;
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const rest = normalized.slice(m.index + m[0].length);
    let segment: string;
    const boundaryWithSentence = rest.match(
      /^([\s\S]*?)(?=\.\s+(?:They|The|Students|Reserved|Priority|Consult|Supplemental|It |Also |The courses |Réservé|Les cours ))/,
    );
    if (boundaryWithSentence) {
      segment = boundaryWithSentence[1];
    } else {
      const dotIdx = rest.indexOf('.');
      segment = dotIdx === -1 ? rest : rest.slice(0, dotIdx);
    }
    let segmentTrim = segment.replace(/^\(\s*/, '').replace(/\s*\)\s*$/, '').trim();
    segmentTrim = segmentTrim.replace(/\.\s*$/, '').trim();
    for (const c of extractCourseCodes(segmentTrim)) {
      if (normalizeCodeKey(c) !== ownKey) codes.add(c);
    }
  }
  return Array.from(codes);
}

async function main(): Promise<void> {
  const entries = await fs.readdir(dataDir);
  const catalogueFiles = entries.filter((n) => /^catalogue\.\d{4}\.json$/.test(n));
  for (const name of catalogueFiles) {
    const p = path.join(dataDir, name);
    const raw = await fs.readFile(p, 'utf-8');
    const data = JSON.parse(raw) as {
      courses: Array<{ code: string; description?: string; component?: string; aliases?: string[] }>;
    };
    if (!Array.isArray(data.courses)) continue;
    for (const c of data.courses) {
      const aliasSource = [c.component, c.description].filter(Boolean).join(' ');
      const aliases = extractPreviouslyAliases(aliasSource, c.code);
      if (aliases.length > 0) c.aliases = aliases;
      else delete c.aliases;
    }
    await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Updated ${name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
