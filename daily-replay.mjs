// The Worker verifies the viewer's sign-in and same-day completion on every request.
export function setupDailyReplay({request, getUsername}) {
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./daily-replay.css?v=1.8-replay2',import.meta.url).href;document.head.append(css);
  const dialog=document.createElement('dialog');dialog.className='daily-replay-dialog';dialog.setAttribute('aria-labelledby','replay-title');
  dialog.innerHTML=`<header class="panel-head"><div><p class="replay-kicker">DAILY CHALLENGE</p><h2 id="replay-title">Replay Mode</h2></div><form method="dialog"><button class="button outline" aria-label="Close replay">Close</button></form></header><div class="replay-body"><form class="replay-picker"><label for="replay-player">Choose a player</label><div><select id="replay-player" required><option value="">Select a player</option></select><button class="button primary" type="submit">Watch replay</button></div></form><p class="replay-description"></p><p class="replay-status" role="status" aria-live="polite"></p><div class="replay-round-nav" role="group" aria-label="Replay rounds"></div><div class="replay-rounds"></div><div class="replay-pagination"></div></div>`;
  document.body.append(dialog);
  const roundsRoot=dialog.querySelector('.replay-rounds'),status=dialog.querySelector('.replay-status'),description=dialog.querySelector('.replay-description'),roundNav=dialog.querySelector('.replay-round-nav'),pagination=dialog.querySelector('.replay-pagination'),picker=dialog.querySelector('.replay-picker'),select=dialog.querySelector('select');
  let maps=[],generation=0,identity=null,checks=new Map(),replay=null,activeDay;
  const number=new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
  const miles=value=>value>0&&value<.1?'<0.1 mi':number.format(value)+' mi';
  const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e};
  function clearMaps(){maps.forEach(map=>map.remove());maps=[];roundsRoot.replaceChildren();pagination.replaceChildren()}
  function clearReplay(){clearMaps();roundNav.replaceChildren();replay=null}
  function reset(){generation++;checks.clear();document.querySelectorAll('.replay-launch,.replay-access-note').forEach(e=>e.remove());if(dialog.open)dialog.close();clearReplay();description.textContent=status.textContent=''}
  function profileChanged(){const next=getUsername()||null;if(next!==identity){identity=next;reset()}}
  async function access(day){profileChanged();if(!day||!getUsername())return null;if(!checks.has(day)){const at=generation;checks.set(day,request({day}).then(r=>at===generation&&r.unlocked?r:null).catch(()=>null))}const result=await checks.get(day);if(!result)checks.delete(day);return result}
  async function decorate(container,entries,day,{note=false}={}){
    profileChanged();const at=generation;const result=await access(day);if(!result||at!==generation||!container.isConnected)return;
    const host=note?document.querySelector('#leaderboard-dialog > .panel-head'):container.closest('.daily-chase-board')?.querySelector('header');if(!host||host.querySelector('.replay-launch'))return;
    const button=node('button','Replay Mode','button outline replay-launch');button.type='button';button.addEventListener('click',()=>openPicker(day));
    const close=host.querySelector('form[method="dialog"]');close?close.before(button):host.append(button);
  }
  async function openPicker(day){
    profileChanged();if(!getUsername())return;
    const at=++generation;activeDay=day;clearReplay();select.replaceChildren(new Option('Select a player',''));description.textContent='Choose a player to explore their five saved guesses. Replays have no sharing or export controls.';status.textContent='Loading available players…';picker.querySelector('button').disabled=true;
    dialog.querySelector('#replay-title').textContent='Replay Mode';if(!dialog.open)dialog.showModal();window.webkit?.messageHandlers?.native?.postMessage({type:'replayVisibility',visible:true});
    try{const result=await request({day});if(at!==generation||!dialog.open)return;for(const player of result.players||[]){select.append(new Option(player.username+' · '+miles(player.averageMiles),player.username))}status.textContent=select.options.length>1?'':'No replays are available for this challenge yet. Scores saved before Replay Mode do not include map guesses.';picker.querySelector('button').disabled=select.options.length<2}catch(error){if(at===generation&&dialog.open)status.textContent=error.message}
  }
  picker.addEventListener('submit',async event=>{
    event.preventDefault();if(!select.value)return;const at=++generation;clearReplay();status.textContent='Loading replay…';picker.querySelector('button').disabled=true;
    try{const result=await request({day:activeDay,gamertag:select.value});if(at!==generation||!dialog.open)return;if(!Array.isArray(result.rounds)||result.rounds.length!==5||!window.L)throw Error('Replay maps could not load. Try again.');replay=result;
      const date=new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'UTC'}).format(new Date(result.day+'T00:00:00Z'));description.textContent=result.username+' · '+date+' · '+miles(result.averageMiles)+' average';status.textContent='';showRound(0);
    }catch(error){if(at===generation&&dialog.open)status.textContent=error.message||'Replay unavailable. Try again.'}finally{if(at===generation)picker.querySelector('button').disabled=false}
  });
  function updateNav(index){roundNav.replaceChildren();for(let i=0;i<6;i++){const b=node('button',i===5?'Overview':String(i+1),'button outline');b.type='button';b.setAttribute('aria-label',i===5?'Replay overview':'Round '+(i+1));b.setAttribute('aria-pressed',String(i===index));b.addEventListener('click',()=>showRound(i));roundNav.append(b)}}
  function showRound(index){
    if(!replay)return;clearMaps();updateNav(index);
    if(index===5){showOverview();return}
    const round=replay.rounds[index],card=node('article',undefined,'replay-round');
    const head=node('div',undefined,'replay-round-head'),text=node('div');text.append(node('p','ROUND '+(index+1)+' OF 5','replay-kicker'),node('h3',round.name),node('p',[round.date,round.rating].filter(Boolean).join(' · '),'replay-event-meta'));
    const score=node('div',undefined,'replay-round-score'),grade=node('span',round.grade,'round-grade-badge');grade.dataset.grade=round.grade;grade.setAttribute('aria-label','Grade '+round.grade);score.append(grade,node('strong',miles(round.miles)));head.append(text,score);
    const mapRoot=node('div',undefined,'replay-map');mapRoot.setAttribute('aria-label','Round '+(index+1)+' map: '+round.name+', guess distance '+miles(round.miles));
    const legend=node('p','Coral: player guess · Gold: '+(round.paths?.length?'surveyed track and nearest point':'recorded tornado location'),'replay-map-note');card.append(head,mapRoot,legend);roundsRoot.append(card);drawMap(mapRoot,round,replay.username);
    const previous=node('button','Previous round','button outline');previous.type='button';previous.disabled=index===0;previous.addEventListener('click',()=>showRound(index-1));
    const progress=node('span',(index+1)+' / 5');const next=node('button',index===4?'View overview':'Next round','button primary');next.type='button';next.addEventListener('click',()=>showRound(index+1));pagination.append(previous,progress,next);
    requestAnimationFrame(()=>maps.forEach(map=>map.invalidateSize({pan:false})));
  }
  function showOverview(){
    const overview=node('section',undefined,'replay-overview');overview.append(node('p','FIVE ROUNDS · ONE DAILY CHASE','replay-kicker'),node('h3',replay.username+'’s rundown'));
    const stats=node('div',undefined,'replay-overview-stats');for(const [label,value]of [['Average distance',miles(replay.averageMiles)],['Closest guess',miles(Math.min(...replay.rounds.map(r=>r.miles)))]]){const item=node('div');item.append(node('span',label),node('strong',value));stats.append(item)}overview.append(stats);
    replay.rounds.forEach((round,i)=>{const row=node('button',undefined,'replay-overview-row');row.type='button';row.setAttribute('aria-label','View round '+(i+1)+': '+round.name);const text=node('div');text.append(node('strong',round.name),node('span',[round.date,round.rating].filter(Boolean).join(' · ')));const grade=node('span',round.grade,'round-grade-badge');grade.dataset.grade=round.grade;const thumb=node('span',undefined,'replay-thumb');if(round.image){const image=node('img');image.src=round.image;image.alt='Photo of '+round.name;image.loading='lazy';image.addEventListener('error',()=>{image.hidden=true},{once:true});thumb.append(image)}row.append(node('span',String(i+1)),thumb,text,grade,node('strong',miles(round.miles)));row.addEventListener('click',()=>showRound(i));overview.append(row)});roundsRoot.append(overview);
    const back=node('button','Back to round 5','button outline');back.type='button';back.addEventListener('click',()=>showRound(4));pagination.append(back);
  }
  function drawMap(root,round,username){
    const L=window.L,map=L.map(root,{scrollWheelZoom:false,fadeAnimation:false});maps.push(map);map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    const point=[round.point.lat,round.point.lng],actual=[round.reference.lat,round.reference.lng],paths=(round.paths||[]).map(path=>path.map(([lng,lat])=>[lat,lng])),bounds=L.latLngBounds([point,actual]);
    if(paths.length){L.polyline(paths,{color:'#e5ba79',weight:5,opacity:.95,interactive:false,className:'survey-track'}).addTo(map);paths.forEach(path=>path.forEach(vertex=>bounds.extend(vertex)))}
    L.polyline([point,actual],{color:'#e85b66',weight:2,dashArray:'5 6',interactive:false}).addTo(map);
    const tip=node('span',username+'’s guess');L.marker(point,{icon:L.divIcon({className:'target',iconSize:[21,21]})}).addTo(map).bindTooltip(tip);L.marker(actual,{icon:L.divIcon({className:'target actual',iconSize:[21,21]})}).addTo(map).bindTooltip(paths.length?'Nearest point on surveyed track':'Recorded location');
    map.fitBounds(bounds,{padding:[35,50],maxZoom:11,animate:false});
  }
  dialog.addEventListener('close',()=>{window.webkit?.messageHandlers?.native?.postMessage({type:'replayVisibility',visible:false});generation++;clearReplay()});
  dialog.addEventListener('contextmenu',event=>{if(!event.target.closest('a'))event.preventDefault()});
  addEventListener('storage',event=>{if(event.key==='tornado-guesser-account-session-v1')reset()});addEventListener('native-reconnect',reset);
  return{decorate,profileChanged,reset,invalidate(){checks.clear()}};
}
