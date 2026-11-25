export function ratingPoints(actual,guess){actual=actual==='EF-U'?'EFU':actual;guess=guess==='EF-U'?'EFU':guess;if(actual.startsWith('EF')!==guess.startsWith('EF'))return 0;if(actual===guess)return 5;if(actual.endsWith('U')||guess.endsWith('U'))return 0;return [5,3,1][Math.abs(Number(actual.at(-1))-Number(guess.at(-1)))]||0;}
const key='tornado-guesser-rating-leaderboard-v163';
const el=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const normalized=s=>s==='EFU'?'EF-U':s;
export function ratingLeaderboard(){try{const rows=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(rows)?rows.filter(r=>typeof r.username==='string'&&Number.isInteger(r.points)&&r.points>=0&&r.points<=25&&Number.isInteger(r.exact)&&r.exact>=0&&r.exact<=5).sort((a,b)=>b.points-a.points||b.exact-a.exact||a.username.localeCompare(b.username)).slice(0,25):[];}catch{return[];}}
export function setupRatingGame({getCatalog,guess,saveScore,onHome,onComplete,onShow}){
  let hintDeck={},hintIndex=0;
  fetch('./rating-hints.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>hintDeck=data).catch(()=>{});
  el('rating-hint').addEventListener('click',()=>{const hints=hintDeck[deck[round]?.id]||[];if(revealed)return;const text=hints[hintIndex++];el('rating-hint-text').textContent=text||'No more hints for this photo.';el('rating-hint-text').hidden=false;el('rating-hint').disabled=hintIndex>=hints.length;});
  let deck=[],round=0,records=[],selected=null,ready=false,revealed=false,loading=false,saving=false,complete=false;
  function showMessage(id,message=''){el(id).textContent=message;el(id).hidden=!message;}
  async function start(){
    if(loading)return;loading=true;
    try{
      const pool=await getCatalog();if(pool.length<5)throw new Error('At least five rated photos are needed.');
      const shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      deck=shuffled.slice(0,5);records=[];round=0;complete=false;
      el('rating-save-form').hidden=true;el('rating-gamertag').disabled=false;el('rating-save-form').querySelector('button').disabled=false;showMessage('rating-save-status');
      onShow();loadRound();
    }finally{loading=false;}
  }
  function loadRound(){
    const event=deck[round];hintIndex=0;el('rating-hint').disabled=false;el('rating-hint-text').hidden=true;selected=null;ready=false;revealed=false;
    el('rating-round-count').textContent='Photo '+(round+1)+' of 5';el('rating-running-score').textContent=records.reduce((s,r)=>s+r.points,0)+' / 25 points';
    el('rating-guess-form').hidden=false;el('rating-reveal').hidden=true;el('rating-next').hidden=true;el('rating-lock').disabled=true;el('rating-full-photo').disabled=true;el('rating-photo').hidden=true;
    const historic=event.ratingScale==='F'||/^F[0-5]$/.test(event.rating||'');const choices=historic?['F0','F1','F2','F3','F4','F5']:['EFU','EF0','EF1','EF2','EF3','EF4','EF5'];
    el('rating-question').textContent='What was its recorded '+(historic?'F':'EF')+' rating?';
    el('rating-scale-note').textContent=historic?'This event predates the EF scale. Choose its original F-scale rating. Appearance alone cannot establish a damage rating.':'Appearance alone cannot establish a damage rating. This challenge tests recognition of real tornado events.';
    el('rating-options').replaceChildren();
    for(const rating of choices){const label=node('label');label.className='rating-option';const input=node('input');input.type='radio';input.name='recorded-rating';input.value=rating;input.disabled=true;input.addEventListener('change',()=>{selected=rating;el('rating-lock').disabled=!ready;});label.append(input,node('span',normalized(rating)));el('rating-options').append(label);}
    showMessage('rating-status');showMessage('rating-photo-status','Loading photo…');
    const image=el('rating-photo');image.onload=()=>{if(deck[round]!==event)return;ready=true;image.hidden=false;el('rating-full-photo').disabled=false;for(const input of el('rating-options').querySelectorAll('input'))input.disabled=false;showMessage('rating-photo-status');};
    image.onerror=()=>{showMessage('rating-photo-status','This photo could not load. Return to game modes and retry.');};image.src='./'+event.image;
    el('rating-title').focus();
  }
  el('rating-guess-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!ready||!selected||revealed||loading)return;loading=true;el('rating-lock').disabled=true;
    try{
      const response=await guess(deck[round],selected);const event=response.event;const points=response.points;
      if(!event||![0,1,3,5].includes(points))throw new Error('The rating could not be checked. Try again.');
      revealed=true;
      records.push({id:event.id,name:event.name,eventDate:event.date,rating:event.rating,image:event.image,guess:normalized(response.guess||selected),points});
      el('rating-running-score').textContent=records.reduce((s,r)=>s+r.points,0)+' / 25 points';
      el('rating-verdict').textContent=points===5?'Exact match':points===3?'One level away':points===1?'Two levels away':'Not this time';
      el('rating-event-name').textContent=event.name;
      el('rating-event-date').textContent=new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'UTC'}).format(new Date(event.date+'T12:00:00Z'));
      el('rating-actual').textContent=normalized(event.rating);el('rating-points').textContent='+'+points;
      el('rating-explanation').textContent=points===5?'You recognized the event and its recorded rating.':'You chose '+normalized(selected)+'. Its recorded rating was '+normalized(event.rating)+'. Funnel size and shape alone do not reliably indicate the damage rating.';
      el('rating-event-source').href=event.source;el('rating-photo-source').href=event.photoSource||event.image;
      el('rating-photo-credit').textContent=(event.photoCredit?'Photo: '+event.photoCredit+'. ':'')+(event.photoLicense||'')+(event.photoEdit?' · '+event.photoEdit:'');
      el('rating-guess-form').hidden=true;el('rating-reveal').hidden=false;el('rating-next').hidden=false;el('rating-next').textContent=round===4?'View run rundown':'Next photo';el('rating-next').focus();
    }catch(error){showMessage('rating-status',error.message);el('rating-lock').disabled=false;}finally{loading=false;}
  });
  el('rating-next').addEventListener('click',()=>{if(!revealed)return;if(round===4){complete=true;el('rating-save-form').hidden=false;onComplete(records,[el('rating-save-form')]);}else{round++;loadRound();}});
  el('rating-home').addEventListener('click',()=>{if(!loading)onHome();});
  el('rating-full-photo').addEventListener('click',()=>{el('full-photo-image').src=el('rating-photo').currentSrc;el('photo-dialog').showModal();});
  el('rating-save-form').addEventListener('submit',async e=>{
    e.preventDefault();if(records.length!==5||saving)return;const username=el('rating-gamertag').value.trim();if(!/^[\p{L}\p{N} _-]{2,20}$/u.test(username)){showMessage('rating-save-status','Use 2–20 letters, numbers, spaces, hyphens or underscores.');return;}
    if(saveScore){
      saving=true;const button=e.currentTarget.querySelector('button');button.disabled=true;el('rating-gamertag').disabled=true;showMessage('rating-save-status','Saving score…');
      try {
        const result=await saveScore(username);
        if(result){showMessage('rating-save-status',result.points<result.bestPoints||(result.points===result.bestPoints&&result.exact<result.bestExact)?'Saved. Your previous best still stands.':'Saved to the online EF Rating leaderboard.');return;}
      }catch(error){showMessage('rating-save-status',error.message||'Could not save. Try again.');button.disabled=false;el('rating-gamertag').disabled=false;return;}
      finally{saving=false;}
    }
    const points=records.reduce((s,r)=>s+r.points,0),exact=records.filter(r=>r.points===5).length;const rows=ratingLeaderboard();const best=rows.find(r=>r.username.toLowerCase()===username.toLowerCase());
    const improved=!best||points>best.points||(points===best.points&&exact>best.exact);
    if(improved){
      const next=rows.filter(r=>r.username.toLowerCase()!==username.toLowerCase()).concat({username,points,exact}).sort((a,b)=>b.points-a.points||b.exact-a.exact||a.username.localeCompare(b.username)).slice(0,25);
      try{localStorage.setItem(key,JSON.stringify(next));}catch{showMessage('rating-save-status','Browser storage is unavailable. Your run is still shown here.');return;}
    }
    showMessage('rating-save-status',!improved?'Your previous best remains on this browser.':'Saved to the EF Rating points leaderboard on this browser.');el('rating-gamertag').disabled=true;e.currentTarget.querySelector('button').disabled=true;
  });
  return{start,resume(){if(complete)onComplete(records,[el('rating-save-form')]);else{onShow();el('rating-title').focus();}},hasRun:()=>deck.length>0,isBusy:()=>loading||saving};
}
