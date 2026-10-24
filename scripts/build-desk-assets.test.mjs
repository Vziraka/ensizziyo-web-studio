import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHostedDesk} from '../pipeline/hosted-desk.mjs';
import {deskAssets} from './build-desk-assets.mjs';
test('hosted module includes exact allowlisted UI bytes and no runtime state',async()=>{
 const assets=await deskAssets();
 assert.deepEqual(Buffer.from(assets['index.html'],'base64'),await readFile(new URL('../pipeline/lifecycle-ui/index.html',import.meta.url)));
 assert.deepEqual(Buffer.from(assets['assets/evz-wordmark.png'],'base64'),await readFile(new URL('../pipeline/lifecycle-ui/assets/evz-wordmark.png',import.meta.url)));
 assert.equal(assets['preview.html'],undefined);assert.equal(assets['state.json'],undefined);assert.equal(assets['config.json'],undefined);
 assert.ok(Object.keys(assets).every(name=>!name.includes('..')||['../follow-up-template.mjs','../business-types.mjs'].includes(name)));
});

test('bundled UI serves without any runtime directory and hides file-system failures',async()=>{
 const assets=await deskAssets(),origin='https://preview.example.invalid',env={CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-synthetic-123',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
 let storage=false;const handler=createHostedDesk({env,assetDirectory:'/deliberately-absent/runtime-path',readAsset:file=>Buffer.from(assets[file],'base64'),storeFactory:()=>{storage=true;throw Error('Not called');}});
 const html=await handler(new Request(origin+'/desk/'));assert.equal(html.status,200);assert.match(await html.text(),/src="\/desk\/app.js"/);
 const image=await handler(new Request(origin+'/desk/assets/evz-wordmark.png'));assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(assets['assets/evz-wordmark.png'],'base64'));assert.equal(storage,false);
 const missing=createHostedDesk({env,readAsset:()=>{throw Object.assign(Error('ENOENT /private/secret-path'),{code:'ENOENT'});}}),response=await missing(new Request(origin+'/desk/'));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret-path|ENOENT/);
});
