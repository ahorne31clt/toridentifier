import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const localWorker=process.env.REVIEW_WORKER_URL;
if(localWorker&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localWorker))throw Error('Review Worker must be a local HTTP server.');
const types={'.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/__review/config'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ranked:Boolean(localWorker)}));return;}
  if(url.pathname.startsWith('/__review/')){
   const path=url.pathname.slice('/__review'.length);
   if(!['/daily','/leaderboard','/daily-score','/rating/run','/rating/guess'].includes(path)){res.writeHead(404);res.end();return;}
   if(!['GET','HEAD'].includes(req.method)&&(!localWorker||req.method!=='POST')){res.writeHead(405);res.end('Review does not forward live submissions.');return;}
   let body;if(req.method==='POST'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('Body too large');chunks.push(chunk);}body=Buffer.concat(chunks);}
   const response=await fetch((localWorker||'https://tornado-guesser-leaderboard.ahorne31.workers.dev')+path+url.search,{method:req.method,body,headers:body?{'Content-Type':'application/json'}:{},signal:AbortSignal.timeout(12000)});
   res.writeHead(response.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(await response.text());return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const path=decodeURIComponent(url.pathname),file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root.endsWith(sep)?root:root+sep)||path.includes('/.')){res.writeHead(403);res.end();return;}
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);
 }catch(error){res.writeHead(error.name==='TimeoutError'?504:404);res.end('Resource unavailable.');}
}).listen(8786,'127.0.0.1',()=>console.log('Tornado Guesser v1.6 — http://127.0.0.1:8786'));
