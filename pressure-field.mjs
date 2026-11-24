// An illustrative animated weather pattern, not a live weather analysis.
const canvas=document.createElement('canvas');canvas.className='pressure-field';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
const ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let w=0,h=0,frame=0,last=-100,start=performance.now();
function draw(t){
 ctx.clearRect(0,0,w,h);const unit=Math.max(w,1000),step=26,cols=Math.ceil(w/step)+1,rows=Math.ceil(h/step)+1,values=new Float32Array(cols*rows);
 const lx=.79+.09*Math.sin(t*.19),ly=.28+.1*Math.cos(t*.14),hx=.12+.08*Math.cos(t*.13),hy=.72+.12*Math.sin(t*.17);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const u=x*step/unit,v=y*step/unit;values[y*cols+x]=-19*Math.exp(-((u-lx)**2/.055+(v-ly)**2/.095))+15*Math.exp(-((u-hx)**2/.11+(v-hy)**2/.07))+5*Math.sin(u*5.7+v*2.5-t*.14)+2.1*Math.sin(v*8-u*2+t*.11);}
 ctx.lineJoin='round';ctx.lineCap='round';
 for(let level=-20;level<=20;level+=2){ctx.beginPath();for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
 const corners=[[x*step,y*step,values[y*cols+x]],[(x+1)*step,y*step,values[y*cols+x+1]],[(x+1)*step,(y+1)*step,values[(y+1)*cols+x+1]],[x*step,(y+1)*step,values[(y+1)*cols+x]]],hits=[];
 for(let e=0;e<4;e++){const p=corners[e],q=corners[(e+1)%4];if((p[2]<level)!==(q[2]<level)){const f=(level-p[2])/(q[2]-p[2]);hits.push([p[0]+f*(q[0]-p[0]),p[1]+f*(q[1]-p[1])]);}}
 for(let i=0;i+1<hits.length;i+=2){ctx.moveTo(...hits[i]);ctx.lineTo(...hits[i+1]);}}
 ctx.strokeStyle=level%8===0?'rgba(166,193,207,.27)':'rgba(154,179,197,.14)';ctx.lineWidth=level%8===0?1.5:.85;ctx.stroke();}
 ctx.setLineDash([7,12]);ctx.strokeStyle='rgba(201,183,134,.09)';ctx.lineWidth=.8;
 for(let b=-2;b<8;b++){ctx.beginPath();for(let x=0;x<=w+20;x+=20){const y=b*155+90*Math.sin(x/unit*5-t*.055)+55*Math.sin(x/unit*2+.7);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.setLineDash([]);
 const cold=f=>[lx*unit+Math.sin(f*2.3)*unit*.11,ly*unit+f*unit*.53],warm=f=>[lx*unit+f*unit*.32,ly*unit-Math.sin(f*2)*unit*.055];
 for(const [point,color]of [[cold,'rgba(110,178,224,.23)'],[warm,'rgba(220,129,137,.22)']]){ctx.beginPath();for(let i=0;i<=60;i++){const p=point(i/60);i?ctx.lineTo(...p):ctx.moveTo(...p);}ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.stroke();ctx.fillStyle=color;
 for(let f=.13;f<1;f+=.15){const[x,y]=point(f),[nx,ny]=point(f+.005);ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(ny-y,nx-x));ctx.beginPath();if(point===cold){ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.lineTo(0,-8);ctx.closePath();}else ctx.arc(0,0,5,Math.PI,0);ctx.fill();ctx.restore();}}
 ctx.strokeStyle='rgba(132,190,169,.17)';ctx.lineWidth=1;
 for(let i=0;i<65;i++){const seed=Math.sin(i*127.1)*43758.5453,f=.06+(seed-Math.floor(seed))*.78,[fx,fy]=cold(f),x=fx+18+(Math.sin(i*39.7)*.5+.5)*unit*.095,y=fy+((t*.2+i*.618)%1)*46-23;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y+5);ctx.stroke();}
 ctx.font='600 15px Arial';ctx.textAlign='center';ctx.fillStyle='rgba(174,155,215,.35)';ctx.fillText('L',lx*unit,ly*unit);ctx.fillStyle='rgba(132,185,207,.3)';ctx.fillText('H',hx*unit,hy*unit);
}
function resize(){w=innerWidth;h=innerHeight;const scale=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);ctx.setTransform(scale,0,0,scale,0,0);if(reduced.matches)draw(0);}
function tick(now){if(now-last>65){draw((now-start)/1000);last=now;}frame=requestAnimationFrame(tick);}
function sync(){cancelAnimationFrame(frame);if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);else if(!document.hidden)draw(0);}
addEventListener('resize',resize);reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);resize();sync();
