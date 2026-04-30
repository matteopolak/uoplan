import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { got } from 'got';
import { CookieJar } from 'tough-cookie';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TERMS_JSON = path.join(__dirname, '../../web/public/data/terms.json');
const SEARCH_URL =
  'https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL';

type Term = { termId: string; name: string };

export function parseTermDropdown(html: string): Term[] {
  const $ = cheerio.load(html);
  const select = $('#CLASS_SRCH_WRK2_STRM\\$35\\$');
  const terms: Term[] = [];
  select.find('option').each((_, opt) => {
    const termId = ($(opt).attr('value') ?? '').trim();
    const name = $(opt).text().replace(/\s+/g, ' ').trim();
    if (termId && name) terms.push({ termId, name });
  });
  const seen = new Set<string>();
  return terms.filter((t) => {
    if (seen.has(t.termId)) return false;
    seen.add(t.termId);
    return true;
  });
}

async function fetchTerms(): Promise<Term[]> {
  const jar = new CookieJar();
  const client = got.extend({
    cookieJar: jar,
    followRedirect: true,
    https: { rejectUnauthorized: true },
  });

  let lastHtml = '';
  for (let attempt = 1; attempt <= 10; attempt++) {
    const res = await client.get(SEARCH_URL);
    lastHtml = res.body;
    const terms = parseTermDropdown(lastHtml);
    if (terms.length > 0) return terms;
  }

  const preview = lastHtml.slice(0, 400).replace(/\s+/g, ' ');
  throw new Error(`Term dropdown not found after 10 attempts. First 400 chars: ${preview}`);
}

async function main() {
  const currentTerms = await fetchTerms();

  const raw = await fs.readFile(TERMS_JSON, 'utf8');
  const { terms: knownTerms } = JSON.parse(raw) as { terms: Term[] };
  const knownIds = new Set(knownTerms.map((t) => t.termId));

  const newTerms = currentTerms.filter((t) => !knownIds.has(t.termId));

  if (newTerms.length > 0) {
    const sorted = [...currentTerms].sort((a, b) => a.termId.localeCompare(b.termId));
    await fs.writeFile(TERMS_JSON, JSON.stringify({ terms: sorted }, null, 2) + '\n', 'utf-8');
  }

  console.log(JSON.stringify(newTerms));
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
