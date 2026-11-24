import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker from '../cloudflare/worker.mjs';
const catalog=JSON.parse(await readFile(new URL('../tornadoes.json',import.meta.url)));
const tracks=JSON.parse(await readFile(new URL('../dat-tracks.json',import.meta.url)));
const sql=await readFile(new URL('../cloudflare/rating-schema.sql',import.meta.url),'utf8');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE arcade_runs(run_id TEXT PRIMARY KEY,gamertag_key TEXT,gamertag TEXT,score_tenths INTEGER);
 CREATE TABLE arcade_best(gamertag_key TEXT PRIMARY KEY,gamertag TEXT,score_tenths INTEGER);
 CREATE TABLE mode_runs(run_id TEXT PRIMARY KEY,board TEXT,gamertag_key TEXT,gamertag TEXT,score_tenths INTEGER);
 CREATE TABLE mode_best(board TEXT,gamertag_key TEXT,gamertag TEXT,score_tenths INTEGER,PRIMARY KEY(board,gamertag_key));
 CREATE TABLE daily_lineups(day TEXT,slot INTEGER,event_id TEXT,PRIMARY KEY(day,slot));
 CREATE TABLE daily_share_cards(board TEXT,gamertag_key TEXT,grades TEXT,PRIMARY KEY(board,gamertag_key));
 INSERT INTO arcade_best VALUES('legacy','Legacy',123);`);
sqlite.exec(sql);sqlite.exec(sql);
class Statement{
 constructor(query){this.query=query;this.values=[];}
 bind(...values){this.values=values;return this;}
 async all(){return {results:sqlite.prepare(this.query).all(...this.values)};}
 async first(){return (await this.all()).results[0]||null;}
 async run(){return {meta:sqlite.prepare(this.query).run(...this.values)};}
}
const DB={prepare:q=>new Statement(q),async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements){if(/^\s*(SELECT|WITH)/i.test(s.query)&&!s.query.includes('INSERT INTO'))out.push(await s.all());else {await s.run();out.push({results:[]});}}sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async url=>{const path=new URL(url).pathname;if(path==='/tornadoes.json')return Response.json(catalog);if(path==='/dat-tracks.json')return Response.json(tracks);return nativeFetch(url);};
async function call(path,input,origin='https://tornadoguesser.app'){
 const response=await worker.fetch(new Request('https://worker.test'+path,{method:input===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json'},...(input!==undefined&&{body:JSON.stringify(input)})}),{DB});return {status:response.status,data:await response.json()};
}
test('Existing scores survive the additive schema; CORS and distance modes work',async()=>{
 assert.equal((await call('/leaderboard')).data.entries[0].username,'Legacy');
 assert.equal((await call('/leaderboard',undefined,'https://bad.example')).status,403);
 for(const mode of ['all','iconic','recent']){
 const {modeCatalog}=await import('../modes.mjs');const pool=modeCatalog(catalog,mode).slice(0,5);
 const result=await call('/leaderboard?mode='+mode,{username:'Mode tester',runId:crypto.randomUUID().replaceAll('-',''),guesses:pool.map(e=>({id:e.id,point:{lat:e.lat,lng:e.lng}}))});
 assert.equal(result.status,200,JSON.stringify(result));assert.equal((await call('/leaderboard?mode='+mode)).data.entries.length,1);
 }
});
test('Rating server assigns five, locks first answer, rejects early saves and ranks server totals',async()=>{
 const run=await call('/rating/run',{});assert.equal(run.status,200);assert.equal(run.data.photos.length,5);assert.equal(new Set(run.data.photos.map(p=>p.id)).size,5);assert.ok(run.data.photos.every(p=>!('rating'in p)&&!('name'in p)));
 const runId=run.data.runId;assert.equal((await call('/leaderboard?mode=rating',{runId,username:'Rating tester',points:15})).status,400);
 for(const p of run.data.photos){const e=catalog.find(e=>e.id===p.id);const answer=await call('/rating/guess',{runId,id:p.id,guess:e.rating});assert.equal(answer.status,200);assert.equal(answer.data.points,3);
 const retry=await call('/rating/guess',{runId,id:p.id,guess:e.rating.startsWith('EF')?'EF0':'F0'});assert.equal(retry.data.points,3);assert.equal(retry.data.guess,e.rating);}
 const saved=await call('/leaderboard?mode=rating',{runId,username:'Rating tester',points:0});assert.equal(saved.status,200);assert.equal(saved.data.points,15);assert.equal(saved.data.exact,5);
 assert.equal((await call('/leaderboard?mode=rating',{runId,username:'Imposter'})).status,409);
 assert.equal((await call('/leaderboard?mode=rating',{runId,username:'Rating tester'})).status,200);
 assert.equal((await call('/leaderboard?mode=rating')).data.entries.length,1);
 assert.equal((await call('/leaderboard?mode=all')).data.entries[0].username,'Mode tester');
});
test('Daily lineup, first-score rule, lookup and share grades survive',async()=>{
 const lineup=(await call('/daily')).data;assert.equal(lineup.ids.length,5);
 const input={username:'Daily tester',runId:crypto.randomUUID().replaceAll('-',''),day:lineup.day,guesses:lineup.ids.map(id=>{const e=catalog.find(e=>e.id===id);return{id,point:{lat:e.lat,lng:e.lng}};})};
 assert.equal((await call('/leaderboard?mode=daily',input)).status,200);
 const lookup=await call('/daily-score?gamertag=Daily%20tester&day='+lineup.day);assert.equal(lookup.status,200);assert.equal(lookup.data.grades.length,5);assert.equal(lookup.data.place,1);
 assert.equal((await call('/leaderboard?mode=daily',{...input,runId:crypto.randomUUID().replaceAll('-','')})).status,409);
 assert.equal((await call('/daily-score?gamertag=Daily%20tester&day='+lineup.day)).data.averageMiles,lookup.data.averageMiles);
 assert.equal((await call('/leaderboard')).data.entries[0].username,'Legacy');
});
