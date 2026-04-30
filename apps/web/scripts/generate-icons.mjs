import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(resolve(__dirname, '../public/favicon.svg'));
const out = resolve(__dirname, '../public/apple-touch-icon.png');

await sharp(svg)
  .resize(180, 180)
  // change the background to the dark background of the website
  .flatten({ background: '#121212' })
  .png()
  .toFile(out);

console.log('Generated apple-touch-icon.png (180x180)');
