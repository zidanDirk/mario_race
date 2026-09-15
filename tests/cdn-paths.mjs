import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';

const dist='dist';
const html=await readFile(join(dist,'index.html'),'utf8');
const references=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
const local=references.filter(value=>!value.startsWith('http:')&&!value.startsWith('https:')&&!value.startsWith('data:')&&!value.startsWith('#'));
assert(local.length>=3,'expected built favicon, stylesheet and script references');
assert.deepEqual(local.filter(value=>value.startsWith('/')),[],`root-relative CDN resources found: ${local.join(', ')}`);

for(const reference of local){
  const relative=reference.replace(/^\.\//,'').split(/[?#]/,1)[0];
  const bytes=await readFile(join(dist,relative));
  assert(bytes.length>0,`missing built resource ${reference}`);
}

const assetFiles=await readdir(join(dist,'assets'));
const sourceFiles=assetFiles.filter(file=>/\.(?:js|css)$/.test(file));
for(const file of sourceFiles){
  const source=await readFile(join(dist,'assets',file),'utf8');
  assert(!/(?:src|href)=["']\/assets\//.test(source),`${file} contains a root-relative asset reference`);
}

console.log(JSON.stringify({passed:true,base:'./',references:local,checkedBundles:sourceFiles.length},null,2));
