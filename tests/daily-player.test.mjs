import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/worker.mjs';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE mode_best(board TEXT,gamertag_key TEXT,gamertag TEXT,score_tenths INTEGER,PRIMARY KEY(board,gamertag_key));CREATE TABLE daily_share_cards(board TEXT,gamertag_key TEXT,grades TEXT,PRIMARY KEY(board,gamertag_key));`);
 const put=(day,key,score)=>sql.prepare('INSERT INTO mode_best VALUES(?,?,?,?)').run('daily:'+day,key.toLowerCase(),key,score);
 class Statement{constructor(query){this.query=query;this.args=[];}bind(...args){this.args=args;return this;}async all(){return {results:sql.prepare(this.query).all(...this.args)};}}
 const DB={prepare:q=>new Statement(q),async batch(stmts){sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.all());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const call=async(query,method='GET')=>{const r=await worker.fetch(new Request('https://worker.test/daily-player?'+query,{method,headers:{Origin:'https://tornadoguesser.app'}}),{DB});return {status:r.status,data:await r.json()};};
 return {sql,put,call};
}
test('Historical Daily stats use saved per-day scores, include legacy rows and compare player-weighted averages',async()=>{
 const {sql,put,call}=fixture();put('2026-11-20','Alice',100);put('2026-11-21','Alice',300);put('2026-11-20','Bob',300);put('2026-11-21','Bob',500);put('2026-11-21','Carol',200);
 // Other modes and future days never affect Daily statistics.
 sql.prepare('INSERT INTO mode_best VALUES(?,?,?,?)').run('all','alice','Alice',9999);put('2099-01-01','Alice',0);
 sql.exec("INSERT INTO daily_share_cards VALUES('daily:2026-11-20','alice','ABCDF')");
 const before=sql.prepare('SELECT * FROM mode_best ORDER BY board,gamertag_key').all();
 const {status,data}=await call('gamertag=aLiCe');assert.equal(status,200);assert.equal(data.eligible,true);assert.equal(data.daysPlayed,2);assert.equal(data.overallAverageMiles,20);assert.equal(data.otherPlayersAverageMiles,40);assert.equal(data.totalPlayers,2);assert.equal(data.totalPlayersWithScores,3);assert.equal(data.overallPlace,1);assert.equal(data.tiedPlayers,1);assert.equal(data.bestMiles,10);
 assert.deepEqual(data.history.map(x=>x.day),['2026-11-21','2026-11-20']);assert.equal(data.history[0].place,2);assert.equal(data.history[0].players,3);assert.equal(data.history[0].grades,null);assert.deepEqual(data.history[1].grades,['A','B','C','D','F']);assert.equal(data.history[0].fieldAverageMiles,33.3);
 assert.deepEqual(sql.prepare('SELECT * FROM mode_best ORDER BY board,gamertag_key').all(),before);assert.ok(!JSON.stringify(data).includes('token'));assert.ok(!('rounds'in data));
});
test('No fabricated peers, missing users, validation, and GET-only access',async()=>{
 const {put,call}=fixture();put('2026-11-20','Solo',0);const r=await call('gamertag=Solo');assert.equal(r.data.otherPlayersAverageMiles,null);assert.equal(r.data.totalPlayers,0);assert.equal(r.data.overallPlace,null);assert.equal(r.data.overallAverageMiles,null);assert.equal(r.data.eligible,false);assert.equal(r.data.history.length,1);
 assert.equal((await call('gamertag=Missing')).status,404);assert.equal((await call('gamertag=%27%3BDROP%20TABLE')).status,400);assert.equal((await call('gamertag=Solo&before=2026-02-30')).status,400);assert.equal((await call('gamertag=Solo','POST')).status,405);
});
test('Second saved day establishes an average; provisional players cannot outrank qualified tied leaders',async()=>{
 const {put,call}=fixture();put('2026-11-20','Leader',500);put('2026-11-21','Leader',700);put('2026-11-20','Challenger',500);put('2026-11-21','Challenger',700);put('2026-11-20','Newcomer',0);
 let r=(await call('gamertag=Newcomer')).data;assert.equal(r.eligible,false);assert.equal(r.overallPlace,null);assert.equal(r.totalPlayers,2);
 const leader=(await call('gamertag=Leader')).data;assert.equal(leader.overallPlace,1);assert.equal(leader.tiedPlayers,2);assert.equal(leader.otherPlayersAverageMiles,60);
 put('2026-11-21','Newcomer',100);r=(await call('gamertag=Newcomer')).data;assert.equal(r.eligible,true);assert.equal(r.overallAverageMiles,5);assert.equal(r.overallPlace,1);assert.equal(r.totalPlayers,3);
});
test('Pagination includes every saved day and lifetime summary is independent of visible page',async()=>{
 const {put,call}=fixture();for(let i=0;i<65;i++){const d=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);put(d,'Historian',i*10);}
 const a=(await call('gamertag=Historian')).data;assert.equal(a.daysPlayed,65);assert.equal(a.history.length,50);assert.ok(a.nextBefore);assert.equal(a.overallAverageMiles,32);
 const b=(await call('gamertag=Historian&before='+a.nextBefore)).data;assert.equal(b.history.length,15);assert.equal(b.nextBefore,null);assert.equal(b.daysPlayed,65);assert.equal(b.overallAverageMiles,32);assert.equal(new Set([...a.history,...b.history].map(x=>x.day)).size,65);
});
