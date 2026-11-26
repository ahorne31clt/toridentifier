import {distanceRunStats, ratingRunStats} from './run-summary.mjs';
const colors={all:'#e85b66',iconic:'#f2cd63',recent:'#82c7ff',rating:'#92dfab'};
export function runShareText({mode,title,rounds,username}) {
  if(mode==='daily')throw new Error('Daily shares must use the spoiler-free Daily Challenge card.');
  const summary=mode==='rating'?`${ratingRunStats(rounds).points} / ${rounds.length*5} points`:`${distanceRunStats(rounds).average.toFixed(1)} mi average`;
  return ['Tornado Guesser · '+title,username||'Guest player',summary,...rounds.map((r,i)=>`${i+1}. ${r.name} · ${r.rating} · ${mode==='rating'?`Guessed ${r.guess} · ${r.points} / 5 pts`:`${r.miles.toFixed(1)} mi · ${r.grade}`}`),'https://tornadoguesser.app/'].join('\n');
}
function loadImage(src) { return new Promise(resolve=>{if(!src)return resolve(null);const image=new Image();const timer=setTimeout(()=>resolve(null),5000);image.onload=()=>{clearTimeout(timer);resolve(image)};image.onerror=()=>{clearTimeout(timer);resolve(null)};image.src=src;}); }
function fitText(ctx,text,x,y,max,size,color='#f3f0e7') {ctx.font=`bold ${size}px Arial`;while(ctx.measureText(text).width>max&&size>16)ctx.font=`bold ${--size}px Arial`;ctx.fillStyle=color;ctx.fillText(text,x,y,max);}
export function setupRunShare() {
  const dialog=document.createElement('dialog');dialog.className='run-share-dialog';dialog.setAttribute('aria-labelledby','run-share-title');
  dialog.innerHTML='<header class="panel-head"><h2 id="run-share-title">Share your rundown</h2><form method="dialog"><button class="button outline" aria-label="Close rundown share">Close</button></form></header><div class="dialog-body"><p>Includes tornado names, photos, and your results.</p><canvas width="1080" height="1350" aria-label="Shareable run rundown"></canvas><div class="run-share-actions"><button class="button primary" data-share-native hidden>Share image</button><a class="button outline" data-share-download hidden>Download PNG</a><button class="button outline" data-share-copy>Copy result</button></div><textarea aria-label="Result text" readonly hidden></textarea><p role="status" class="run-share-status"></p></div>';
  document.body.append(dialog);
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./run-share.css?v=1.7-replay1',import.meta.url).href;document.head.append(link);
  const canvas=dialog.querySelector('canvas'),share=dialog.querySelector('[data-share-native]'),download=dialog.querySelector('[data-share-download]'),status=dialog.querySelector('.run-share-status'),textBox=dialog.querySelector('textarea');
  let generation=0,url,file,text='';
  async function open(result) {
    if(result.mode==='daily')return;
    const at=++generation;if(url)URL.revokeObjectURL(url);url=null;file=null;
    text=runShareText(result);textBox.value=text;textBox.hidden=true;share.hidden=download.hidden=true;status.textContent='Preparing your rundown…';canvas.hidden=true;
    if(!dialog.open)dialog.showModal();
    const [logo,...images]=await Promise.all([loadImage(document.querySelector('.brand-mark')?.src||'./logo.png'),...result.rounds.map(r=>loadImage(r.image))]);
    if(at!==generation||!dialog.open)return;
    const ctx=canvas.getContext('2d'),accent=colors[result.mode]||colors.all;
    ctx.fillStyle='#191c23';ctx.fillRect(0,0,1080,1350);ctx.strokeStyle='#ffffff16';ctx.lineWidth=1;
    for(let i=0;i<15;i++){ctx.beginPath();ctx.ellipse(1000,170,180+i*38,110+i*32,-.4,0,Math.PI*2);ctx.stroke()}
    ctx.fillStyle=accent;ctx.fillRect(40,40,1000,6);ctx.strokeStyle='#555864';ctx.strokeRect(40,40,1000,1270);
    if(logo)ctx.drawImage(logo,72,70,72,72);fitText(ctx,'TORNADO GUESSER',160,114,800,29);
    fitText(ctx,result.title.toUpperCase(),72,211,936,48);fitText(ctx,result.username||'Guest player',72,260,936,28,'#b8bdc8');
    const summary=result.mode==='rating'?`${ratingRunStats(result.rounds).points} / ${result.rounds.length*5} POINTS`:`${distanceRunStats(result.rounds).average.toFixed(1)} MI AVERAGE`;
    fitText(ctx,summary,72,331,936,45,accent);
    for(const [i,r] of result.rounds.entries()){
      const y=375+i*158;ctx.fillStyle='#252932';ctx.fillRect(72,y,936,142);ctx.fillStyle=accent;ctx.fillRect(72,y,3,142);
      const image=images[i];if(image){const x=90,iy=y+12,iw=158,ih=118;const ratio=Math.max(iw/image.width,ih/image.height);ctx.save();ctx.beginPath();ctx.rect(x,iy,iw,ih);ctx.clip();ctx.drawImage(image,x+(iw-image.width*ratio)/2,iy+(ih-image.height*ratio)/2,image.width*ratio,image.height*ratio);ctx.restore()}else{ctx.fillStyle='#333946';ctx.fillRect(90,y+12,158,118)}
      fitText(ctx,'ROUND '+(i+1),270,y+28,400,16,'#a9afbb');fitText(ctx,r.name,270,y+64,705,29);fitText(ctx,[r.eventDate,r.rating].filter(Boolean).join(' · '),270,y+93,700,20,'#a9afbb');
      const score=result.mode==='rating'?`Guessed ${r.guess}  ·  ${r.points} / 5 points`:`${r.miles.toFixed(1)} mi  ·  Grade ${r.grade}`;
      fitText(ctx,score,270,y+123,700,23,accent);
    }
    fitText(ctx,'FIVE STORMS. YOUR CHASE.',72,1235,936,22,'#b6bdc7');fitText(ctx,'tornadoguesser.app',72,1279,936,28);
    canvas.hidden=false;canvas.setAttribute('aria-label',text);
    try {
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(at!==generation||!dialog.open)return;
      if(!blob)throw Error();file=new File([blob],'tornado-guesser-'+result.mode+'-rundown.png',{type:'image/png'});url=URL.createObjectURL(blob);download.href=url;download.download=file.name;download.hidden=false;share.hidden=!(window.webkit?.messageHandlers?.native||navigator.canShare?.({files:[file]}));status.textContent='';
    }catch{status.textContent='Image export unavailable. You can still copy your result.'}
  }
  share.addEventListener('click',async()=>{if(!file)return;try{if(window.webkit?.messageHandlers?.native){window.webkit.messageHandlers.native.postMessage({type:'shareImage',data:canvas.toDataURL('image/png').split(',')[1],text});return}await navigator.share({files:[file],text})}catch(error){if(error.name!=='AbortError')status.textContent='Use Download PNG or Copy result.'}});
  dialog.querySelector('[data-share-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text);status.textContent='Result copied.'}catch{textBox.hidden=false;textBox.focus();textBox.select();status.textContent='Select and copy your result.'}});
  dialog.addEventListener('close',()=>{generation++;if(url)URL.revokeObjectURL(url);url=file=null;canvas.getContext('2d').clearRect(0,0,1080,1350)});
  return {open};
}
