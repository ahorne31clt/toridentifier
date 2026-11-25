for(const [i,card] of [...document.querySelectorAll('.mode-card')].entries()){
const layer=document.createElement('div');layer.className='card-motion';layer.setAttribute('aria-hidden','true');
for(const cls of ['card-target','card-sweep','card-pulse']){const item=document.createElement('span');item.className=cls;item.style.animationDelay=(-i*4)+'s';layer.append(item);}card.append(layer);
}
