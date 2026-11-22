import { resolve } from 'node:path';
import { DEFAULT_OUT, REPO_ROOT } from './lib-html.mjs';
import { measurePages } from './measure-pages.mjs';
import { measureInbound } from './measure-inbound.mjs';
import { measureRegions } from './measure-regions.mjs';
import { measureSections } from './measure-sections.mjs';
import { measureLinks } from './measure-links.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : DEFAULT_OUT;

console.log(`Rekonesans strony: ${REPO_ROOT}`);
console.log(`Katalog wyjściowy: ${outDir}`);

const pagesData = await measurePages(outDir, REPO_ROOT);
console.log('1/5 pages.json + typy-stron.md:', JSON.stringify(pagesData.summary));

const inboundData = await measureInbound(outDir, pagesData, REPO_ROOT);
console.log(`2/5 inbound.json + drogi-dojscia.md: kategorie=${inboundData.catMatrix.length}, produkty=${inboundData.prodMatrix.length}`);

const regionsData = await measureRegions(outDir, pagesData, REPO_ROOT);
console.log(`3/5 regions.md + breadcrumbs.json: kotwice=${regionsData.anchorReport.length}, odchylenia okruszków=${regionsData.bcDeviations.length}`);

const sectionsData = await measureSections(outDir, pagesData, REPO_ROOT);
console.log(`4/5 sections.json + umiejscowienie.md + katalog-komponentow.md: komponenty=${sectionsData.components.length}`);

const linksData = await measureLinks(outDir, pagesData, REPO_ROOT);
console.log('5/5 links-broken.json + niespojnosci.md:', JSON.stringify(linksData.summary));
