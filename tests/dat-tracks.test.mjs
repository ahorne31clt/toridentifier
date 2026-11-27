import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dailyTrack,scoreGuess,trackPaths} from '../scoring.mjs';
const tracks=JSON.parse(await readFile(new URL('../dat-tracks.json',import.meta.url)));
const events=JSON.parse(await readFile(new URL('../tornadoes.json',import.meta.url)));
const audit=JSON.parse(await readFile(new URL('../dat-audit-2026-11-27.json',import.meta.url)));
test('28 reviewed new DAT matches have unique source IDs, intact paths and original official rating scales',()=>{
 assert.equal(audit.added,28);assert.equal(Object.keys(tracks).length,64);const used=new Set();
 for(const {id,officialRating,globalId} of audit.addedTracks){const t=tracks[id];assert.equal(t.features[0].globalId,globalId);assert.equal(t.dailyEffectiveFrom,'2026-11-28');assert.equal(events.find(e=>e.id===id).rating,officialRating);assert.ok(trackPaths(t).every(p=>p.length>1));}
 for(const t of Object.values(tracks))for(const f of t.features){assert.ok(!used.has(f.globalId));used.add(f.globalId);}
 assert.notEqual(tracks['003'].features[0].globalId,tracks['funnel-2aa5c733b656'].features[0].globalId,'Mayfield and Monette-Samburg remain distinct tornadoes');
});
test('New track geometry starts on the next Daily challenge while other modes can use it immediately',()=>{
 const e=events.find(e=>e.id==='funnel-90e2c90ac678'),track=tracks[e.id];
 assert.equal(dailyTrack(track,'2026-11-27'),undefined);assert.equal(dailyTrack(track,'2026-11-28'),track);assert.equal(dailyTrack(tracks['003'],'2026-11-27'),tracks['003']);
 const [lng,lat]=track.features[0].paths[0][0],point={lng,lat};
 assert.ok(scoreGuess({...e,track},point,null).miles<1e-5,'exact DAT vertex scores as zero distance');
 assert.ok(scoreGuess({...e,track:dailyTrack(track,'2026-11-27')},point,null).miles>1,'today retains original reference-point scoring');
});
