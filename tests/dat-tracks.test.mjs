import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dailyTrack,scoreGuess,trackPaths} from '../scoring.mjs';
const tracks=JSON.parse(await readFile(new URL('../dat-tracks.json',import.meta.url)));
const events=JSON.parse(await readFile(new URL('../tornadoes.json',import.meta.url)));
const audit=JSON.parse(await readFile(new URL('../dat-audit-2026-11-27.json',import.meta.url)));
test('28 reviewed new DAT matches have unique source IDs, intact paths and original official rating scales',()=>{
 assert.equal(audit.added,28);assert.equal(Object.values(tracks).filter(t=>t.sourceType!=='nws-archive').length,64);const used=new Set();
 for(const {id,officialRating,globalId} of audit.addedTracks){const t=tracks[id];assert.equal(t.features[0].globalId,globalId);assert.equal(t.dailyEffectiveFrom,'2026-11-28');assert.equal(events.find(e=>e.id===id).rating,officialRating);assert.ok(trackPaths(t).every(p=>p.length>1));}
 for(const t of Object.values(tracks).filter(t=>t.sourceType!=='nws-archive'))for(const f of t.features){assert.ok(!used.has(f.globalId));used.add(f.globalId);}
 assert.notEqual(tracks['003'].features[0].globalId,tracks['funnel-2aa5c733b656'].features[0].globalId,'Mayfield and Monette-Samburg remain distinct tornadoes');
});

test('Archived NWS surveys retain source geometry, distinct provenance and Daily activation',async()=>{
 const archive=JSON.parse(await readFile(new URL('../nws-archive-tracks.json',import.meta.url)));
 assert.equal(Object.keys(archive).length,2);assert.equal(Object.keys(tracks).length,66);
 for(const [id,t] of Object.entries(archive)){
   assert.deepEqual(tracks[id],t);assert.equal(t.sourceType,'nws-archive');
   assert.match(t.sourceUrl,/^https:\/\/www\.weather\.gov\//);assert.ok(t.sourceLabel);
   assert.equal(dailyTrack(t,'2026-11-27'),undefined);assert.equal(dailyTrack(t,'2026-11-28'),t);
   for(const f of t.features){assert.equal(f.globalId,undefined);assert.equal(f.eventDate,events.find(e=>e.id===id).date);for(const path of f.paths)for(const [lng,lat] of path)assert.ok(scoreGuess({...events.find(e=>e.id===id),track:t},{lng,lat},null).miles<1e-5);}
 }
 assert.equal(trackPaths(archive['002'])[0].length,56);
 const hackleburg=trackPaths(archive['funnel-d4f410ce70be']);
 assert.deepEqual(hackleburg.map(p=>p.length),[7,25]);assert.deepEqual(hackleburg[0].at(-1),hackleburg[1][0]);
});
test('New track geometry starts on the next Daily challenge while other modes can use it immediately',()=>{
 const e=events.find(e=>e.id==='funnel-90e2c90ac678'),track=tracks[e.id];
 assert.equal(dailyTrack(track,'2026-11-27'),undefined);assert.equal(dailyTrack(track,'2026-11-28'),track);assert.equal(dailyTrack(tracks['003'],'2026-11-27'),tracks['003']);
 const [lng,lat]=track.features[0].paths[0][0],point={lng,lat};
 assert.ok(scoreGuess({...e,track},point,null).miles<1e-5,'exact DAT vertex scores as zero distance');
 assert.ok(scoreGuess({...e,track:dailyTrack(track,'2026-11-27')},point,null).miles>1,'today retains original reference-point scoring');
});
