import {playerRank} from './scoring.mjs';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const miles=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n)+' mi':'—';
const date=day=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
export {crown as playerCrown};
function crown(label){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 20');svg.setAttribute('class','daily-player-crown');svg.setAttribute('role','img');svg.setAttribute('aria-label',label);const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d','M2 5 7 9 12 2 17 9 22 5 19 16H5ZM5 19H19');p.setAttribute('fill','#e5ba79');p.setAttribute('stroke','#e5ba79');p.setAttribute('stroke-width','1.5');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;}
export function setupDailyPlayer({request,roundGradeBadges}) {
 const dialog=node('dialog',undefined,'daily-player-dialog');dialog.id='daily-player-dialog';dialog.setAttribute('aria-labelledby','daily-player-title');
 dialog.innerHTML='<header class="panel-head"><div><p class="daily-player-kicker">DAILY CHALLENGE · PLAYER HISTORY</p><h2 id="daily-player-title"></h2></div><form method="dialog"><button class="button outline" aria-label="Close player history">Close</button></form></header><div class="daily-player-body"><p class="daily-player-status" role="status" aria-live="polite"></p><div class="daily-player-content" hidden><div class="daily-player-summary"></div><p class="daily-player-comparison"></p><p class="daily-player-method"></p><div class="daily-player-history"><table><caption>Saved Daily challenges · latest first</caption><thead><tr><th scope="col">Challenge day</th><th scope="col">Avg. miles</th><th scope="col">Place</th><th scope="col">Rounds 1–5</th></tr></thead><tbody></tbody></table></div><button class="button outline daily-player-more" hidden>Load earlier days</button><p class="daily-player-note">Only saved Daily results are included. Older scores may not have round grades. Historical scores keep their original scoring.</p></div><button class="button outline daily-player-retry" hidden>Try again</button></div>';
 document.body.append(dialog);
 const title=dialog.querySelector('h2'),status=dialog.querySelector('[role="status"]'),content=dialog.querySelector('.daily-player-content'),summary=dialog.querySelector('.daily-player-summary'),comparison=dialog.querySelector('.daily-player-comparison'),method=dialog.querySelector('.daily-player-method'),body=dialog.querySelector('tbody'),more=dialog.querySelector('.daily-player-more'),retry=dialog.querySelector('.daily-player-retry');
 let generation=0,current='',nextBefore=null,busy=false,days=new Set();
 function card(label,value,detail){const e=node('div',undefined,'daily-player-stat');e.append(node('span',label),node('strong',value));if(detail)e.append(node('small',detail));return e;}
 async function load(append=false){
  if(busy)return;busy=true;const at=generation,name=current;more.disabled=true;retry.hidden=true;status.textContent=append?'Loading earlier challenges…':'Loading saved Daily history…';
  try{
   const data=await request(name,append?nextBefore:null);if(at!==generation||!dialog.open)return;
   if(!Array.isArray(data.history)||!Number.isInteger(data.daysPlayed)||data.daysPlayed<1||(data.eligible&&!Number.isFinite(data.overallAverageMiles)))throw Error('Player history could not load. Try again.');
   title.textContent=data.username;
   if(data.overallPlace===1)title.append(crown(data.tiedPlayers>1?'Joint overall Daily number one':'Overall Daily number one'));
   const rating=node('span','PLAYER RATING · '+(data.eligible?playerRank(data.overallAverageMiles):'PROVISIONAL'),'player-rank daily-player-rating');rating.dataset.rank=data.eligible?playerRank(data.overallAverageMiles):'provisional';rating.setAttribute('aria-label',data.eligible?'Lifetime Daily player rating '+playerRank(data.overallAverageMiles)+' based on '+miles(data.overallAverageMiles)+' average':'Provisional: save results on two Daily challenge days to establish a player rating');title.append(rating);
   summary.replaceChildren(card('LIFETIME DAILY AVG.',miles(data.overallAverageMiles),data.eligible?'Across all saved Daily days':'Requires 2 saved Daily days'),card('OVERALL DAILY RANK',data.eligible?(data.tiedPlayers>1?'Tied ':'')+'#'+data.overallPlace:'—',data.eligible?'of '+data.totalPlayers+' qualified players':'Provisional · 2 days required'),card('DAYS PLAYED',String(data.daysPlayed),'Saved Daily challenges'),card('BEST DAILY AVG.',miles(data.bestMiles),'Lowest saved daily average'));
   if(!data.eligible)comparison.textContent='Complete and save '+Math.max(0,(data.minimumDays||2)-data.daysPlayed)+' more Daily challenge day to establish your lifetime average, EF player rating, and overall rank.';
   else if(Number.isFinite(data.otherPlayersAverageMiles)){
    const diff=Math.round((data.overallAverageMiles-data.otherPlayersAverageMiles)*10)/10;
    comparison.textContent='Other players’ lifetime average: '+miles(data.otherPlayersAverageMiles)+'. '+(diff<0?miles(-diff)+' closer on average.':diff>0?miles(diff)+' farther on average.':'Equal at the displayed precision.');
   }else comparison.textContent='No other players have qualified with two saved Daily days yet.';
   method.textContent=data.comparison;
   for(const r of data.history){if(days.has(r.day))continue;days.add(r.day);const tr=node('tr'),day=node('th',date(r.day));day.scope='row';tr.append(day,node('td',miles(r.averageMiles)),node('td','#'+r.place+' / '+r.players));const grades=node('td');grades.append(roundGradeBadges(r.grades));tr.append(grades);body.append(tr);}
   nextBefore=data.nextBefore;more.hidden=!nextBefore;content.hidden=false;status.textContent='';
  }catch(error){if(at!==generation||!dialog.open)return;status.textContent=error.status===404?'No saved Daily history is available for this player.':error.message||'Player history is temporarily unavailable. Try again.';retry.hidden=false;}
  finally{if(at===generation){busy=false;more.disabled=false;}}
 }
 function open(username){generation++;busy=false;current=username;nextBefore=null;days=new Set();title.textContent=username;content.hidden=true;body.replaceChildren();summary.replaceChildren();if(!dialog.open)dialog.showModal();load();}
 more.addEventListener('click',()=>load(true));retry.addEventListener('click',()=>load(Boolean(nextBefore)));dialog.addEventListener('close',()=>{generation++;busy=false;});
 return {open,button(username,{leader=false}={}){const b=node('button',undefined,'daily-player-link');b.append(node('span',username));if(leader)b.append(crown('Today’s number one Daily player'));b.type='button';b.setAttribute('aria-label',(leader?'Today’s #1 player. ':'')+'View '+username+'’s Daily Challenge history');b.addEventListener('click',()=>open(username));return b;}};
}
