/* Gesture Hill Climb — browser edition.
   Original mechanics translated from the supplied Python/Pygame project to Canvas + MediaPipe Hands. */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const video = document.getElementById('camera');
const cameraPanel = document.getElementById('cameraPanel');
const gestureStatus = document.getElementById('gestureStatus');
const startOverlay = document.getElementById('startOverlay');
const toast = document.getElementById('toast');

const W = canvas.width, H = canvas.height, GROUND_Y = 490;
const VEHICLES = [
  {name:'Trail Buggy', color:'#e24928', engine:900, maxSpeed:430, note:'Balanced and easy to control'},
  {name:'Mountain Truck', color:'#2e7ad8', engine:1120, maxSpeed:385, note:'Powerful on steep hills'},
  {name:'Sprint Rover', color:'#f7ba28', engine:820, maxSpeed:510, note:'Fast on smoother terrain'}
];
const SCENES = [
  {name:'ALPINE PASS', sky:'#60beeF', sun:'#ffe07c', far:'#6d97ac', near:'#477573', ground:'#547f2d', line:'#2f5b21'},
  {name:'SUNSET CANYON', sky:'#ee815d', sun:'#ffe78e', far:'#ad594e', near:'#844137', ground:'#9a5c32', line:'#673922'},
  {name:'MIDNIGHT VALLEY', sky:'#192a5e', sun:'#e1ecf8', far:'#2e4270', near:'#1e304b', ground:'#285b4b', line:'#173e36'}
];
const COINS = Array.from({length:220},(_,i)=>430+i*155);
const FUELS = Array.from({length:56},(_,i)=>690+i*610);
const GAPS = Array.from({length:9},(_,i)=>2400+i*3000);

function terrainY(x){ return GROUND_Y + 55*Math.sin(x*.010) + 24*Math.sin(x*.026+1.3) + 10*Math.sin(x*.071); }
function terrainSlope(x){ return 55*.010*Math.cos(x*.010) + 24*.026*Math.cos(x*.026+1.3) + 10*.071*Math.cos(x*.071); }
function sceneFor(x){ return SCENES[Math.floor(x/1500)%SCENES.length]; }
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function roundRect(x,y,w,h,r,fill,stroke){
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
}
function text(t,x,y,size=18,color='#fff',align='left',weight=700){ ctx.font=`${weight} ${size}px Arial`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(t,x,y); }
function line(points,color,width=4){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}

function drawBackground(cameraX, scene){
  ctx.fillStyle=scene.sky;ctx.fillRect(0,0,W,H);
  ctx.fillStyle=scene.sun;ctx.beginPath();ctx.arc(875,95,48,0,Math.PI*2);ctx.fill();
  const farShift=(cameraX*.12)%330;
  const far=[[-330-farShift,395],[-140-farShift,235],[55-farShift,395],[250-farShift,245],[455-farShift,395],[650-farShift,205],[880-farShift,395],[1210,395],[W,450],[0,450]];
  ctx.fillStyle=scene.far;ctx.beginPath();ctx.moveTo(...far[0]);far.slice(1).forEach(p=>ctx.lineTo(...p));ctx.fill();
  const nearShift=(cameraX*.28)%390;
  const near=[[-390-nearShift,430],[-180-nearShift,275],[20-nearShift,430],[205-nearShift,285],[405-nearShift,430],[600-nearShift,260],[815-nearShift,430],[1200,430],[W,470],[0,470]];
  ctx.fillStyle=scene.near;ctx.beginPath();ctx.moveTo(...near[0]);near.slice(1).forEach(p=>ctx.lineTo(...p));ctx.fill();
  if(scene.name==='MIDNIGHT VALLEY'){
    for(let x=60;x<W;x+=95){const y=75+(x*17)%145;ctx.fillStyle='#e6f0ff';ctx.beginPath();ctx.arc(x,y,2,0,7);ctx.fill();}
  } else {
    for(let x=-100;x<W+100;x+=170){const drift=(cameraX*.06)%170,cx=x-drift;ctx.fillStyle='#f5fcff';for(const [dx,dy,r] of [[0,90,18],[24,78,25],[48,94,17]]){ctx.beginPath();ctx.arc(cx+dx,dy+(x%3)*18,r,0,7);ctx.fill();}}
  }
}
function drawTree(x,y,s=.75){ctx.fillStyle='#684729';ctx.fillRect(x-5*s,y-30*s,10*s,30*s);for(const [dx,dy,r] of [[0,-42,22],[-14,-30,17],[15,-30,17]]){ctx.fillStyle='#2b8343';ctx.beginPath();ctx.arc(x+dx*s,y+dy*s,r*s,0,7);ctx.fill();}}
function drawCactus(x,y){ctx.fillStyle='#357b59';roundRect(x-7,y-52,14,52,6,ctx.fillStyle);roundRect(x-22,y-37,15,10,5,ctx.fillStyle);roundRect(x-22,y-49,10,22,5,ctx.fillStyle);roundRect(x+7,y-25,16,10,5,ctx.fillStyle);roundRect(x+13,y-37,10,22,5,ctx.fillStyle);}
function button(rect,label,active=false,color='#246394'){roundRect(rect.x+3,rect.y+3,rect.w,rect.h,12,'#142f47');roundRect(rect.x,rect.y,rect.w,rect.h,10,active?'#4691ce':color);text(label,rect.x+rect.w/2,rect.y+rect.h/2+8,22,'#fff','center',800);}

class Car{
  constructor(profile){this.profile=profile;this.reset();}
  reset(){this.x=266;this.previousX=this.x;this.speed=0;this.fuel=100;this.distance=0;this.airAngle=0;this.airHeight=0;this.verticalSpeed=0;this.jumping=false;this.jumpCooldown=0;this.crashed=false;this.crashReason='';this.coins=0;this.collectedCoins=new Set();this.collectedFuel=new Set();this.notice='';this.noticeTimer=0;}
  update(dt,c){
    if(this.crashed){return;}
    const slope=terrainSlope(this.x), incline=Math.atan(slope);
    let acc=0;
    if(c.throttle && this.fuel>0){acc+=this.profile.engine*c.throttle;this.fuel=Math.max(0,this.fuel-4.2*c.throttle*dt);}
    if(c.brake)acc-=590*c.brake;
    if(c.boost&&this.fuel>0){acc+=1200;this.fuel=Math.max(0,this.fuel-11*dt);}
    acc-=Math.sin(incline)*580;acc-=this.speed*.75;
    this.speed=clamp(this.speed+acc*dt,-170,this.profile.maxSpeed);
    this.previousX=this.x;this.x=Math.max(0,this.x+this.speed*dt);this.distance=Math.max(this.distance,this.x-180);
    this.jumpCooldown=Math.max(0,this.jumpCooldown-dt);
    const jumpStarted=c.jump&&!this.jumping&&this.jumpCooldown<=0;
    if(jumpStarted){this.jumping=true;this.airHeight=1;this.verticalSpeed=480;this.notice='JUMP!';this.noticeTimer=.5;}
    if(this.jumping){this.airHeight+=this.verticalSpeed*dt;this.verticalSpeed-=780*dt;if(this.airHeight<=0){this.airHeight=0;this.verticalSpeed=0;this.jumping=false;this.jumpCooldown=.35;}}
    else this.airAngle+=(incline-this.airAngle)*Math.min(1,9*dt);
    this.noticeTimer=Math.max(0,this.noticeTimer-dt);
    return jumpStarted?'jump':null;
  }
  collect(){
    const events=[];
    COINS.forEach((p,i)=>{if(!this.collectedCoins.has(i)&&Math.abs(this.x-p)<32){this.collectedCoins.add(i);this.coins++;this.notice='+1 COIN';this.noticeTimer=1;events.push('coin');}});
    FUELS.forEach((p,i)=>{if(!this.collectedFuel.has(i)&&Math.abs(this.x-p)<38){this.collectedFuel.add(i);this.fuel=Math.min(100,this.fuel+34);this.notice='FUEL REFILLED';this.noticeTimer=1.3;events.push('fuel');}});
    return events;
  }
  hazard(){if(this.crashed)return false;for(const g of GAPS){if(this.previousX<g&&g<=this.x&&!this.jumping){this.crashed=true;this.speed=0;this.crashReason='FELL INTO A CLIFF GAP! CLOSE RIGHT FIST TO JUMP';return true;}}return false;}
}

function drawCar(car,cameraX){
  const sx=car.x-cameraX, ground=terrainY(car.x);
  ctx.save();ctx.translate(sx,ground-36-car.airHeight);ctx.rotate(-car.airAngle);
  roundRect(-43,-11,86,26,8,car.profile.color);ctx.fillStyle='#f58f2d';ctx.beginPath();ctx.moveTo(-28,-11);ctx.lineTo(-11,-25);ctx.lineTo(13,-25);ctx.lineTo(28,-11);ctx.fill();
  roundRect(0,-21,18,10,2,'#b5e0f0');ctx.fillStyle='#eeb786';ctx.beginPath();ctx.arc(9,-16,6,0,7);ctx.fill();
  for(const x of [-34,26]){ctx.fillStyle='#20242a';ctx.beginPath();ctx.arc(x,17,14,0,7);ctx.fill();ctx.fillStyle='#c3c9cc';ctx.beginPath();ctx.arc(x,17,6,0,7);ctx.fill();}
  ctx.restore();
}

function drawGame(car,controls,highScore){
  const cameraX=Math.max(0,car.x-250), scene=sceneFor(car.x);drawBackground(cameraX,scene);
  const pts=[];for(let sx=-20;sx<W+30;sx+=10)pts.push([sx,terrainY(cameraX+sx)]);
  ctx.fillStyle=scene.ground;ctx.beginPath();ctx.moveTo(...pts[0]);pts.slice(1).forEach(p=>ctx.lineTo(...p));ctx.lineTo(W+20,H);ctx.lineTo(-20,H);ctx.fill();line(pts,scene.line,5);
  for(const gapX of GAPS){if(gapX<cameraX-60||gapX>cameraX+W+60)continue;const sx=gapX-cameraX,ly=terrainY(gapX-42),ry=terrainY(gapX+42);ctx.fillStyle='#121924';ctx.beginPath();ctx.moveTo(sx-42,ly-5);ctx.lineTo(sx+42,ry-5);ctx.lineTo(sx+56,H);ctx.lineTo(sx-56,H);ctx.fill();line([[sx-50,ly-8],[sx-10,ly-5]],'#ffd04a',5);line([[sx+10,ry-5],[sx+50,ry-8]],'#ffd04a',5);}
  for(let wx=Math.floor(cameraX/190)*190-190;wx<cameraX+W+190;wx+=190){const sx=wx-cameraX,ty=terrainY(wx)-4;scene.name==='SUNSET CANYON'?drawCactus(sx,ty):drawTree(sx,ty);}
  COINS.forEach((wx,i)=>{if(car.collectedCoins.has(i)||wx<cameraX-30||wx>cameraX+W+30)return;const sx=wx-cameraX,sy=terrainY(wx)-48;ctx.fillStyle='#f8cd2e';ctx.beginPath();ctx.arc(sx,sy,13,0,7);ctx.fill();ctx.fillStyle='#ffef80';ctx.beginPath();ctx.arc(sx,sy,8,0,7);ctx.fill();text('C',sx,sy+7,14,'#8b6016','center',900);});
  FUELS.forEach((wx,i)=>{if(car.collectedFuel.has(i)||wx<cameraX-30||wx>cameraX+W+30)return;const sx=wx-cameraX,sy=terrainY(wx)-56;roundRect(sx-11,sy-16,22,30,4,'#ef4e36');roundRect(sx-4,sy-9,8,13,2,'#ffde5f');});
  drawCar(car,cameraX);
  text(`DISTANCE  ${Math.max(0,Math.floor(car.distance/10))} m`,26,44,24);text(`SPEED  ${Math.floor(Math.abs(car.speed)/2)}`,26,75,24);text(car.profile.name,26,105,18,'#fff283');text(scene.name,26,130,18,'#fff283');text(`COINS  ${car.coins}`,230,44,24,'#ffef80');text(`BEST  ${highScore} m`,232,78,18,'#fff283');
  text('FUEL',W-280,45,18);roundRect(W-220,27,175,23,8,'#374144');roundRect(W-217,30,169*car.fuel/100,17,6,car.fuel>25?'#f3b927':'#e14830');
  text(controls.message,26,H-38,18,controls.handFound?'#fff283':'#f5f5f5');text('Right hand up = drive  •  Left hand up = brake  •  C = calibrate',W-505,H-38,16,'#eaf4fa');
  if(car.distance<40&&!car.crashed){roundRect(W/2-240,130,480,74,8,'rgba(15,34,46,.78)');text('First test: hold RIGHT ARROW for 2 seconds',W/2,158,20,'#ffef8f','center');text('Then press C with both hands low; raise RIGHT hand to drive.',W/2,188,15,'#fff','center');}
  if(car.noticeTimer>0)text(car.notice,W/2,255,30,'#ffef80','center',900); else if(!car.crashed){const ng=GAPS.find(g=>g>car.x);if(ng&&ng-car.x<420)text('CLIFF GAP AHEAD — CLOSE RIGHT FIST TO JUMP!',W/2,160,20,'#ffe77b','center',900);}
  if(car.crashed){ctx.fillStyle='rgba(14,18,24,.68)';ctx.fillRect(0,0,W,H);text('CRASHED!',W/2,H/2-75,48,'#ffe170','center',900);text(car.crashReason,W/2,H/2-20,18,'#ffeed0','center',700);button({x:W/2-105,y:H/2+35,w:210,h:52},'RESTART',true);text('Or press R / raise both hands',W/2,H/2+100,16,'#fff','center');}
  button({x:W-118,y:16,w:92,h:35},'EXIT',false,'#9d473f');
}

function drawMenu(){drawBackground(0,SCENES[0]);ctx.fillStyle='rgba(9,31,48,.35)';ctx.fillRect(0,0,W,H);text('GESTURE HILL CLIMB',W/2,190,48,'#ffef8f','center',900);text('Drive hills with your hands',W/2,240,24,'#fff','center');button({x:W/2-130,y:285,w:260,h:64},'START GAME',true);button({x:W/2-130,y:370,w:260,h:55},'EXIT',false,'#9d473f');text('Choose your car, then use right hand = drive and left hand = brake.',W/2,485,17,'#fff','center');}
function drawSelect(selected){drawBackground(0,SCENES[0]);text('CHOOSE YOUR CAR',W/2,110,42,'#ffef8f','center',900);VEHICLES.forEach((v,i)=>{const r={x:85+i*335,y:175,w:280,h:260};roundRect(r.x-3,r.y-3,r.w+6,r.h+6,18,i===selected?'#ffec97':'#19435c');roundRect(r.x,r.y,r.w,r.h,15,'#25668b');roundRect(r.x+48,r.y+72,184,55,14,v.color);ctx.fillStyle='#1f252a';for(const x of [r.x+87,r.x+195]){ctx.beginPath();ctx.arc(x,r.y+135,23,0,7);ctx.fill();}text(v.name,r.x+35,r.y+52,24);text(v.note,r.x+26,r.y+204,14,'#e7f4fa');text(`Power ${v.engine}  •  Top ${v.maxSpeed}`,r.x+20,r.y+236,14,'#ffef8f');});button({x:90,y:530,w:170,h:52},'BACK');button({x:W-300,y:530,w:210,h:52},'PLAY',true);}

let state='menu', selectedCar=0, car=new Car(VEHICLES[0]), highScore=Number(localStorage.getItem('gestureHillClimbBest')||0), last=performance.now();
let keys={};
const controls={throttle:0,brake:0,boost:false,jump:false,restart:false,handFound:false,message:'Keyboard mode'};

function setState(s){state=s;}
function restart(){car.reset();showToast('READY!');}
function showToast(t){toast.textContent=t;toast.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.add('hidden'),700);}
function pointer(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
canvas.addEventListener('click',e=>{const p=pointer(e);if(state==='menu'&&p.x>W/2-130&&p.x<W/2+130&&p.y>285&&p.y<349)setState('select');else if(state==='select'){for(let i=0;i<3;i++){const r={x:85+i*335,y:175,w:280,h:260};if(p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)selectedCar=i;}if(p.y>=530&&p.y<=582&&p.x<280)setState('menu');if(p.y>=530&&p.y<=582&&p.x>W-300){car=new Car(VEHICLES[selectedCar]);setState('playing');}}else if(state==='playing'){if(p.x>W-130&&p.y<65)setState('menu');else if(car.crashed&&p.x>W/2-105&&p.x<W/2+105&&p.y>H/2+35&&p.y<H/2+87)restart();}});
window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(['ArrowRight','ArrowLeft','ArrowUp',' '].includes(e.key))e.preventDefault();if(e.key.toLowerCase()==='c')gesture.recalibrate();if(e.key.toLowerCase()==='r'&&state==='playing'&&car.crashed)restart();if(e.key==='Escape'&&state==='playing')state='menu';});
window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

const gesture={enabled:false,hands:null,stream:null,history:{Right:[],Left:[]},neutral:{Right:.62,Left:.62},lastHands:{},rightOpenStreak:0,rightFistStreak:0,rightJumpArmed:true,recalibrate(){for(const s of ['Right','Left']){if(this.lastHands[s]!=null){this.neutral[s]=this.lastHands[s];this.history[s]=[];}}showToast('CALIBRATED');}};
function palmY(lm){return lm[9].y;}
function isOpen(lm){const p=lm[9];return [8,12,16,20].filter(i=>Math.hypot(lm[i].x-p.x,lm[i].y-p.y)>.18).length>=3;}
function isFist(lm){const p=lm[9];return [8,12,16,20].filter(i=>Math.hypot(lm[i].x-p.x,lm[i].y-p.y)<.16).length>=3;}
function smooth(side,y){const a=gesture.history[side];a.push(y);if(a.length>5)a.shift();return a.reduce((s,v)=>s+v,0)/a.length;}
function processResults(res){controls.throttle=controls.brake=0;controls.jump=false;controls.restart=false;controls.handFound=false;const statuses=[];let rightSeen=false;if(res.multiHandLandmarks&&res.multiHandedness){controls.handFound=true;res.multiHandLandmarks.forEach((lm,idx)=>{const side=res.multiHandedness[idx].label;let y=smooth(side,palmY(lm));gesture.lastHands[side]=y;const open=isOpen(lm),fist=isFist(lm);const amount=open?clamp((gesture.neutral[side]-y-.06)/.30,0,1):0;if(side==='Right'){rightSeen=true;if(open){gesture.rightOpenStreak++;gesture.rightFistStreak=0;}else if(fist){gesture.rightFistStreak++;gesture.rightOpenStreak=0;}else{gesture.rightOpenStreak=0;gesture.rightFistStreak=0;}const confirmed=gesture.rightOpenStreak>=2;if(confirmed)gesture.rightJumpArmed=true;controls.throttle=confirmed?amount:0;const jump=gesture.rightFistStreak>=3&&gesture.rightJumpArmed;controls.jump=jump;if(jump)gesture.rightJumpArmed=false;statuses.push(`RIGHT ${jump?'JUMP':fist?'FIST - HOLD':confirmed?'DRIVE':'SHOW OPEN PALM'}: ${Math.round(amount*100)}%`);}else{controls.brake=amount;statuses.push(`LEFT BRAKE: ${Math.round(amount*100)}%`);}});controls.restart=controls.throttle>.65&&controls.brake>.65;controls.message=controls.restart?'BOTH HANDS UP: RESTART':statuses.join('  | ');}else{controls.message='Show one hand to the camera';}if(!rightSeen){gesture.rightOpenStreak=0;gesture.rightFistStreak=0;}gestureStatus.textContent=controls.message;}

async function startCamera(){
  if(!window.isSecureContext){throw new Error('Camera requires HTTPS (or localhost).');}
  gesture.stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
  video.srcObject=gesture.stream;await video.play();cameraPanel.classList.remove('hidden');
  if(typeof Hands==='undefined')throw new Error('MediaPipe Hands failed to load.');
  gesture.hands=new Hands({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
  gesture.hands.setOptions({maxNumHands:2,modelComplexity:0,minDetectionConfidence:.65,minTrackingConfidence:.60});
  gesture.hands.onResults(processResults);gesture.enabled=true;
  const off=document.createElement('canvas');off.width=640;off.height=480;const octx=off.getContext('2d');
  async function loop(){if(!gesture.enabled)return;octx.save();octx.scale(-1,1);octx.drawImage(video,-off.width,0,off.width,off.height);octx.restore();await gesture.hands.send({image:off});requestAnimationFrame(loop);}loop();
}
function stopCamera(){gesture.enabled=false;if(gesture.stream)gesture.stream.getTracks().forEach(t=>t.stop());cameraPanel.classList.add('hidden');}

document.getElementById('cameraStart').onclick=async()=>{try{await startCamera();startOverlay.classList.add('hidden');setState('menu');}catch(err){gestureStatus.textContent=err.message;alert(`Camera could not start.\n\n${err.message}\n\nYou can still use Keyboard Only.`);}};
document.getElementById('keyboardStart').onclick=()=>{stopCamera();startOverlay.classList.add('hidden');setState('menu');};

function frame(now){const dt=Math.min((now-last)/1000,.04);last=now;if(state==='playing'){const c={...controls};c.throttle=Math.max(c.throttle,keys['arrowright']||keys['d']?1:0);c.brake=Math.max(c.brake,keys['arrowleft']||keys['a']?1:0);c.boost=keys[' ']||false;c.jump=c.jump||keys['arrowup']||keys['w']||keys['j'];if(car.crashed&&(keys['r']||controls.restart))restart();const ev=car.update(dt,c);car.collect();if(car.hazard()){showToast('CRASH!');}const d=Math.max(0,Math.floor(car.distance/10));if(d>highScore){highScore=d;localStorage.setItem('gestureHillClimbBest',highScore);}}if(state==='menu')drawMenu();else if(state==='select')drawSelect(selectedCar);else drawGame(car,controls,highScore);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
window.addEventListener('beforeunload',stopCamera);
