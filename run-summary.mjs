import {setupRunShare} from './run-share.mjs?v=1.7-replay1';
import {playerRank} from './scoring.mjs';
export function distanceRunStats(rounds) {
  const miles=rounds.map(r=>r.miles);
  if(!miles.length||miles.some(n=>!Number.isFinite(n)||n<0))throw new Error('A complete scored run is required.');
  const average=miles.reduce((a,b)=>a+b,0)/miles.length;
  return {average,closest:Math.min(...miles),rank:playerRank(average)};
}
export function ratingRunStats(rounds) {
  return {points:rounds.reduce((sum,r)=>sum+r.points,0),exact:rounds.filter(r=>r.points===5).length,near:rounds.filter(r=>r.points===3).length};
}
const el=id=>document.getElementById(id);
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const miles=n=>(n>0&&n<.1?'<0.1':number.format(n))+' mi';
const date=d=>new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function setupRunSummary({onHome,onAgain,canLeave=()=>true,onShareDaily=()=>false,getShareUsername=()=>''}) {
  let moved=[],current;
  const sharing=setupRunShare();
  const share=document.createElement('button');share.type='button';share.className='button outline';share.textContent='Share rundown';share.id='run-summary-share';
  el('run-summary-copy').after(share);
  share.addEventListener('click',()=>{if(!current)return;if(current.mode==='daily'){if(!onShareDaily()){el('run-summary-status').textContent='Save your Daily Challenge score to share its spoiler-free result.';el('run-summary-status').hidden=false;}}else sharing.open({...current,username:getShareUsername(current.mode)||current.username});});
  function restoreControls(){for(const {control,parent,next} of [...moved].reverse())parent.insertBefore(control,next?.parentNode===parent?next:null);moved=[];}
  function close(){el('run-summary-screen').hidden=true;restoreControls();}
  function show({mode,title,rounds,controls=[],note='',username=''}) {
    restoreControls();current={mode,title,rounds,username};share.textContent=mode==='daily'?'Share Daily result':'Share rundown';
    for(const id of ['home-screen','play-screen','rating-screen','grade-details','round-summary'])el(id).hidden=true;
    el('run-summary-screen').hidden=false;
    document.body.dataset.gameMode=mode;
    el('run-summary-mode').textContent=title;
    el('run-summary-caption').textContent=rounds.length+' storms. Here’s how you did.';
    el('run-summary-round-count').textContent=rounds.length+' completed rounds';
    el('run-summary-stats').replaceChildren();
    const rating=mode==='rating';const stats=rating?ratingRunStats(rounds):distanceRunStats(rounds);
    const items=rating?[['Your score',stats.points+' / '+rounds.length*5],['Exact matches',stats.exact+' / '+rounds.length],['One level away',String(stats.near)]]:[['Average distance',miles(stats.average)],['Closest guess',miles(stats.closest)],['Player rank',stats.rank]];
    for(const [label,value] of items){const d=node('div');d.append(node('span',label),node('strong',value));el('run-summary-stats').append(d);}
    el('run-summary-rounds').replaceChildren();
    rounds.forEach((r,index)=>{
      const row=node('article');row.className='run-summary-row';
      const photo=node('button');photo.type='button';photo.className='run-summary-photo';photo.setAttribute('aria-label','View photo for '+r.name);
      const img=node('img');img.src=r.image;img.alt='';img.loading='lazy';photo.append(img);
      photo.addEventListener('click',()=>{el('full-photo-image').src=r.image;el('photo-dialog').showModal();});
      const text=node('div');const h=node('h3',r.name);const details=node('p',date(r.eventDate)+' · '+r.rating);
      text.append(h,details);
      if(rating)text.append(node('p','Your guess: '+r.guess+' · Recorded: '+r.rating));
      else if(Number.isFinite(r.dateError))text.append(node('p','Date guess: '+number.format(r.dateError)+' days off'));
      const value=node('strong',rating?'+'+r.points+' pts':miles(r.miles));
      if(!rating){const grade=node('span',r.grade);grade.className='run-summary-grade';grade.dataset.grade=r.grade;value.append(grade);}
      row.append(node('span',String(index+1).padStart(2,'0')),photo,text,value);el('run-summary-rounds').append(row);
    });
    for(const control of controls){moved.push({control,parent:control.parentNode,next:control.nextSibling});el('run-summary-save-controls').append(control);}
    el('run-summary-again').hidden=mode==='daily';
    el('run-summary-status').textContent=note;el('run-summary-status').hidden=!note;
    el('run-summary-title').focus();window.scrollTo({top:0,behavior:'instant'});
  }
  el('run-summary-home').addEventListener('click',()=>{if(!canLeave())return;close();onHome();});
  el('run-summary-again').addEventListener('click',()=>{if(!canLeave())return;const mode=current.mode;close();onAgain(mode);});
  el('run-summary-copy').addEventListener('click',async()=>{
    if(!current)return;const {mode,title,rounds}=current;
    const score=mode==='rating'?ratingRunStats(rounds).points+' / '+rounds.length*5+' points':miles(distanceRunStats(rounds).average)+' average';
    const text=['Tornado Guesser · '+title,score,'https://tornadoguesser.app/'].join('\n');
    try{await navigator.clipboard.writeText(text);el('run-summary-status').textContent='Result copied.';}catch{el('run-summary-status').textContent=text;}
    el('run-summary-status').hidden=false;
  });
  return {show,close};
}
