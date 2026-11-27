import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {ratingPoints} from '../rating-game.mjs';
import {distanceRunStats,ratingRunStats} from '../run-summary.mjs';
const root=new URL('../',import.meta.url);
test('All referenced UI IDs and local scripts exist; required controls retained',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'duplicate HTML ID');
 for(const file of ['game.mjs','rating-game.mjs','run-summary.mjs','share-card.mjs']){const js=await readFile(new URL(file,root),'utf8');for(const m of js.matchAll(/el\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),file+' references missing '+m[1]);}
 for(const m of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g))await access(new URL(m[1],root));
 for(const id of ['find-daily','daily-lookup-share','daily-share-open','leaderboard-button','account-button'])assert.ok(ids.includes(id));
 assert.ok(html.includes('href="./feedback.html"'));assert.ok(!html.includes('Previous combined scores'));
});
test('Rating points preserve scales; run metrics use the correct units',()=>{
 assert.equal(ratingPoints('EF3','EF3'),5);assert.equal(ratingPoints('EF3','EF2'),3);assert.equal(ratingPoints('EF3','EF1'),1);assert.equal(ratingPoints('EF3','EF0'),0);assert.equal(ratingPoints('EFU','EFU'),5);assert.equal(ratingPoints('EF-U','EFU'),5);assert.equal(ratingPoints('EFU','EF0'),0);assert.equal(ratingPoints('F5','EF5'),0);
 assert.deepEqual(distanceRunStats([10,20,30,40,50].map(miles=>({miles}))),{average:30,closest:10,rank:'EF-3'});
 assert.deepEqual(ratingRunStats([5,5,3,0,0].map(points=>({points}))),{points:13,exact:2,near:1});
});
