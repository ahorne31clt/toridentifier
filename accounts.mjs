const tokenKey='tornado-guesser-account-session-v1';
export function setupAccounts({request,onProfile}){
 const el=id=>document.getElementById(id);
 let token='';try{token=localStorage.getItem(tokenKey)||'';}catch{}
 let available=false;
 const remember=value=>{token=value;try{value?localStorage.setItem(tokenKey,value):localStorage.removeItem(tokenKey);}catch{}};
 const message=text=>{el('account-message').hidden=!text;el('account-message').textContent=text||'';};
 async function call(path,input){return request(path,input,token);}
 async function refresh(){const profile=await call('profile');onProfile(profile);return profile;}
 async function submit(event){
 event.preventDefault();const intent=event.submitter?.value||'login';
 const form=el('account-form'),data=Object.fromEntries(new FormData(form));
 const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);message('Please wait…');
 try{
 const result=await call(intent,data);remember(result.token);onProfile(result);form.reset();el('pin-note').textContent='Use a PIN just for Tornado Guesser.';message('');
 if(result.recoveryCode){el('account-recovery').hidden=false;el('account-recovery-code').textContent=result.recoveryCode;}
 }catch(error){message(error.message);}finally{buttons.forEach(b=>b.disabled=false);}
 }
 function generate(){const n=new Uint32Array(1);do{crypto.getRandomValues(n);}while(n[0]>=4294000000);const pin=String(n[0]%1000000).padStart(6,'0');el('pin').value=pin;el('pin-note').textContent='Your PIN: '+pin+'. Save it before creating your account.';}
 el('generate-pin').addEventListener('click',generate);
 function activate(){
 if(available)return;available=true;
 el('account-form').addEventListener('submit',submit);
 
 el('account-recover-toggle').addEventListener('click',()=>{const box=el('recovery-fields');box.hidden=!box.hidden;el('recover-account').hidden=box.hidden;});
 el('sign-out').addEventListener('click',async()=>{try{await call('logout',{});remember('');el('account-recovery').hidden=true;onProfile({username:null,history:[],total:0});}catch(e){message(e.message);}});
 }
 function render(profile){
 el('account-form').hidden=Boolean(profile.username);el('sign-out').hidden=!profile.username;
 el('account-button').textContent=profile.username?profile.username+' · My scores':'Sign in / Register';
 el('account-state').textContent=profile.username?'Signed in as '+profile.username+'. Saved runs sync when you sign in on another browser.':'Create an account to save completed runs across browsers. Guest play is still available.';
 el('round-summary').textContent=profile.total+' saved account runs';
 const history=el('history');history.replaceChildren();
 if(!profile.history.length){history.textContent=profile.username?'Finish a run and save its score to start your history.':'You can register an existing guest gamertag if nobody has registered it yet. Earlier leaderboard scores stay in place; your synced run history starts with new saved runs.';return;}
 const table=document.createElement('table');const header=table.createTHead().insertRow();for(const label of ['Mode / date','Score','Rounds']){const th=document.createElement('th');th.textContent=label;header.append(th);}
 const body=table.createTBody();for(const run of profile.history){const row=body.insertRow();row.insertCell().textContent=({all:'Photo Challenge',iconic:'Iconic EF4 / EF5',recent:'Past Year',daily:'Daily Challenge',rating:'Guess the EF Rating'}[run.mode]||run.mode)+' · '+new Date(run.savedAt).toLocaleDateString();row.insertCell().textContent=run.mode==='rating'?run.points+'/15 · '+run.exact+' exact':Number(run.averageMiles).toFixed(1)+' mi';row.insertCell().textContent=(run.rounds||[]).map(r=>run.mode==='rating'?(r.points===3?'✓':r.points===1?'~':'×'):r.grade).join(' · ');}history.append(table);
 }
 return {activate,refresh,render,get token(){return token;},get available(){return available;}};
}
