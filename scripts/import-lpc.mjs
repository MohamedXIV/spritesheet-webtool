/**
 * Import a deliberately small, fully attributed LPC starter catalog.
 * Usage: node scripts/import-lpc.mjs ../lpc-source
 * The upstream checkout must contain the selected spritesheets. CREDITS.csv is
 * read from its git object so a sparse checkout works too.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const source = resolve(process.argv[2] ?? '../lpc-source');
const target = resolve(import.meta.dirname, '..');
const actions = ['idle', 'walk', 'run', 'slash'];
const definitions = [
  ['body-male', 'body', 'male', 'Male base', 'body/bodies/male'],
  ['body-female', 'body', 'female', 'Female base', 'body/bodies/female'],
  ['head-male', 'head', 'male', 'Human head', 'head/heads/human/male'],
  ['head-female', 'head', 'female', 'Human head', 'head/heads/human/female'],
  ['eyes-neutral', 'eyes', 'all', 'Neutral', 'eyes/human/adult/neutral'],
  ['eyes-angry', 'eyes', 'all', 'Angry', 'eyes/human/adult/anger'],
  ['eyes-sad', 'eyes', 'all', 'Sad', 'eyes/human/adult/sad'],
  ['hair-buzzcut', 'hair', 'all', 'Buzzcut', 'hair/buzzcut/adult'],
  ['hair-bob', 'hair', 'all', 'Bob', 'hair/bob/adult'],
  ['hair-long', 'hair', 'all', 'Long', 'hair/long/adult'],
  ['beard-basic', 'beard', 'male', 'Full beard', 'beards/beard/basic'],
  ['beard-trimmed', 'beard', 'male', 'Trimmed beard', 'beards/beard/trimmed'],
  ['top-tee-male', 'top', 'male', 'T-shirt', 'torso/clothes/shortsleeve/tshirt/male'],
  ['top-tee-female', 'top', 'female', 'T-shirt', 'torso/clothes/shortsleeve/tshirt/female'],
  ['top-long-male', 'top', 'male', 'Long sleeves', 'torso/clothes/longsleeve/longsleeve/male'],
  ['top-long-female', 'top', 'female', 'Long sleeves', 'torso/clothes/longsleeve/longsleeve/female'],
  ['bottom-pants', 'bottom', 'male', 'Trousers', 'legs/pants/male'],
  ['bottom-leggings', 'bottom', 'female', 'Leggings', 'legs/leggings/thin'],
  ['shoes-male', 'shoes', 'male', 'Shoes', 'feet/shoes/basic/male'],
  ['shoes-female', 'shoes', 'female', 'Shoes', 'feet/shoes/basic/thin'],
];

function parseCsv(input) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (inQuotes && input[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field.trim()); field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const csv = execFileSync('git', ['show', 'HEAD:CREDITS.csv'], { cwd: source, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
const rows = parseCsv(csv);
const creditsByFile = new Map(rows.slice(1).map(([filename, notes, authors, licenses, urls]) => [filename, { notes, authors, licenses, urls }]));
const expressionCredits = new Map();
for (const expression of ['neutral', 'angry', 'sad']) {
  const definition = JSON.parse(execFileSync('git', ['show', `HEAD:sheet_definitions/head/faces/face_${expression}.json`], {
    cwd: source, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  }));
  // Expression images are not individually present in CREDITS.csv. Use the
  // upstream expression-family attribution instead, including variant authors.
  const family = definition.credits ?? [];
  const gather = (property) => [...new Set(family.flatMap((entry) => entry[property] ?? []))].join(',');
  expressionCredits.set(`eyes-${expression === 'angry' ? 'angry' : expression}`, {
    notes: `Expression-family attribution from upstream face_${expression}.json; no exact PNG row in CREDITS.csv.`,
    authors: gather('authors'), licenses: gather('licenses'), urls: gather('urls'),
  });
}
const credits = {};
const manifest = [];

for (const [id, slot, gender, label, sourceDir] of definitions) {
  manifest.push({ id, slot, gender, label, sourceDir });
  for (const action of actions) {
    const relative = `${sourceDir}/${action}.png`;
    const src = join(source, 'spritesheets', relative);
    const dest = join(target, 'public', 'lpc', id, `${action}.png`);
    if (!existsSync(src)) throw new Error(`Missing LPC asset: ${src}`);
    const png = readFileSync(src);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    if (width % 64 !== 0 || height !== 256) throw new Error(`Unexpected LPC layout: ${relative} (${width}x${height})`);
    // Some upstream expression sheets are present in spritesheets/ but do not
    // have individual CREDITS.csv entries. Keep that distinction explicit.
    const attribution = creditsByFile.get(relative) ?? expressionCredits.get(id) ?? {
      notes: 'No per-file row in upstream CREDITS.csv. Review the full upstream LPC credits and licenses.',
      authors: 'LPC contributors — consult the full upstream credits',
      licenses: 'LPC artwork: check upstream licensing',
      urls: 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/CREDITS.csv',
    };
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    credits[`${id}/${action}`] = { filename: relative, ...attribution };
  }
}

writeFileSync(join(target, 'src/data/lpcManifest.json'), `${JSON.stringify({ sourceRevision, actions, assets: manifest }, null, 2)}\n`);
writeFileSync(join(target, 'src/data/lpcCredits.json'), `${JSON.stringify(credits, null, 2)}\n`);
console.log(`Imported ${manifest.length * actions.length} LPC assets from ${sourceRevision.slice(0, 12)} with source credits and expression-family fallback.`);
