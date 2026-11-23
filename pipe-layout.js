/* 管割付の幾何モデル。距離=m、材料厚=mm。荷重ソルバから独立。 */
(function(root){
'use strict';
const f=(x,n=3)=>Number(x).toFixed(n), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WALL={.9:[80,100],1.2:[100,125],1.5:[125,150],1.8:[160,160],2.2:[190,190]};
function offset(sh,side){
 if(sh[side+'Mode']==='direct')return +sh[side+'Direct']||0;
 const type=sh[side+'Type'];
 if(side==='arrival'&&type==='manhole'){const D=+sh.manholeSize||1.2;return D/2+(WALL[D]?.[(+sh.manholeGrade||1)-1]||0)/1000;}
 if(type==='circle')return +sh[side+'CircleOff']||0;
 return (+sh[side+'L']||0)/2+(side==='launch'?(+sh.launchOffset||0):0);
}
function arrival(sh,D,total){
 const mode=sh.arrivalStopMode||'inner', off=offset(sh,'arrival');
 if(!Number.isFinite(D)||D<=0)throw Error('推進管の外径を確認してください。');
 if(mode!=='inner'){
  const push=Number(sh.arrivalPushOut??0.3);
  if(!Number.isFinite(push)||push<0)throw Error('押込み量は0以上の数値にしてください。');
  return {mode,push,tip:total-off+push,center:total,R:0,r:D/2,missing:0,a:0,off};
 }
 const R=Number(sh.arrivalInnerD??(sh.arrivalType==='manhole'?sh.manholeSize:1.2))/2,r=D/2;
 if(!(R>r))throw Error('到達人孔内径は推進管外径より大きくしてください。個別の停止位置も選べます。');
 const a=Math.sqrt(R*R-r*r),push=off-a;
 if(push<0)throw Error('人孔内面の押切位置が到達坑口の手前です。到達坑口〜人孔芯距離を確認してください。');
 return {mode,push,tip:total-a,center:total,R,r,a,missing:R-a,off};
}
function route(d){
 const al=d.alignment||{}, cv=al.curves||[], st=al.straightSpecs||[], segs=[];
 const ang=cv.map(c=>(+c.deg+(+c.min||0)/60+(+c.sec||0)/3600)*Math.PI/180);
 const tl=cv.map((c,i)=>+c.R*Math.tan(ang[i]/2));let s=0,X=0,Y=0,th=0;
 const add=(L,k,spec,label,curveNo)=>{
  if(!Number.isFinite(L)||L< -1e-7)throw Error(label+'の長さが負です。線形を確認してください。');
  if(L<1e-9)return;
  segs.push({s,L,k,X,Y,th,spec:spec||null,label,curveNo});
  const q=step({X,Y,th},k,L);X=q.X;Y=q.Y;th=q.th;s+=L;
 };
 if(!cv.length)add((+al.seg_L0||0)+(+al.finalL||0),0,st[0]?.layoutSpec||st[0]?.spec,'直線',0);
 else {
  add((+al.seg_L0||0)-tl[0],0,st[0]?.layoutSpec||st[0]?.spec,'第1直線',0);
  cv.forEach((c,i)=>{
   if(!(c.R>0&&ang[i]>0&&ang[i]<Math.PI))throw Error('曲線の半径・交角を確認してください。');
   add(c.R*ang[i],(c.dir==='L'?-1:1)/c.R,c.layoutSpec||c.spec,'曲線'+(i+1),i+1);
   add(i<cv.length-1?(+cv[i+1].L||0)-tl[i]-tl[i+1]:(+al.finalL||0)-tl[i],0,st[i+1]?.layoutSpec||st[i+1]?.spec,'第'+(i+2)+'直線',0);
  });
 }
 if(!(s>0))throw Error('線形の長さを入力してください。');
 const at=z=>{
  const sg=segs.find(g=>z>=g.s-1e-9&&z<=g.s+g.L+1e-9);
  if(sg)return step(sg,sg.k,z-sg.s);
  return z<0?{X:z,Y:0,th:0}:step({X,Y,th},0,z-s);
 };
 return {segs,total:s,at};
}
function step(q,k,L){return Math.abs(k)<1e-12?{X:q.X+L*Math.cos(q.th),Y:q.Y+L*Math.sin(q.th),th:q.th}:{X:q.X+(Math.sin(q.th+k*L)-Math.sin(q.th))/k,Y:q.Y-(Math.cos(q.th+k*L)-Math.cos(q.th))/k,th:q.th+k*L};}
function standard(){return {version:1,patterns:[{name:'A',mc:12,lc:2,ms:12,ls:1},{name:'B',mc:13,lc:3,ms:13,ls:1}],ranges:[]};}
function material(settings,no,pitch){
 const r=settings.ranges.find(r=>no>=r.from&&no<=r.to);
 const p=r&&r.pattern!=='PB'?settings.patterns.find(p=>p.name===r.pattern):null;
 const on=r?r.pul:true,thick=r?+r.thick:10,crush=r?+r.crush:0;
 return {pattern:r?r.pattern:'PB',pul:on,thick,crush,p,cushion:(on?thick-crush:0)+(p?p.ls*pitch:0),maximum:(on?thick-crush:0)+(p?p.lc*pitch:0),specified:!!r};
}
function validate(settings){
 if(!settings||!Array.isArray(settings.patterns)||!Array.isArray(settings.ranges))throw Error('材料指定の保存形式を確認してください。');
 const names=new Set();settings.patterns.forEach(p=>{
  if(!p.name||names.has(p.name))throw Error('パターン名を重複させないでください。');names.add(p.name);
  if(![11,12,13,14,15].includes(+p.mc)||![11,12,13,14,15].includes(+p.ms)||!Number.isInteger(+p.ls)||!Number.isInteger(+p.lc)||p.ls<1||p.lc<p.ls||p.lc>6)throw Error('FJの全周層数は1以上、上下面層数は全周層数以上・6以下にしてください。');
 });
 settings.ranges.forEach((r,i)=>{
  if(!Number.isInteger(r.from)||!Number.isInteger(r.to)||r.from<1||r.to<r.from)throw Error('目地範囲は1以上の整数で開始≦終了にしてください。');
  if(settings.ranges.slice(0,i).some(q=>q.from<=r.to&&q.to>=r.from))throw Error('材料指定の目地範囲が重複しています。');
  if(!Number.isFinite(+r.thick)||!Number.isFinite(+r.crush)||r.thick<0||r.crush<0||r.crush>r.thick)throw Error('パルリングの厚さ・つぶれ代を確認してください（0≦つぶれ代≦厚さ）。');
  if(r.pattern!=='PB'&&!names.has(r.pattern))throw Error('存在しないパターンです。');
 });
}
function specAt(d,rt,s){
 const g=rt.segs.find(g=>s>=g.s-1e-9&&s<=g.s+g.L+1e-9)||rt.segs.at(-1),b=d.pipe||{},o=(g.spec?.on===false?{}:g.spec)||{};
 const outer=+(o.outer??b.outer),inner=+(o.inner??b.inner),len=+(o.len??o.lp??b.len);
 if(!(len>0&&outer>inner&&inner>0))throw Error('管の外径・内径・有効長を確認してください。');
 return {outer,inner,len,category:o.category||b.category,jointType:+(o.jointType??b.jointType),g};
}
function signature(d){
 const rt=route(d),sh=d.shaft||{},a=arrival(sh,specAt(d,rt,rt.total).outer,rt.total);
 const round=v=>Math.round(v*1e8)/1e8;
 return JSON.stringify({pipe:d.pipe?.specSignature||null,route:rt.segs.map(g=>{const p=specAt(d,rt,g.s+g.L/2);return [g.s,g.L,g.k,p.outer,p.inner,p.nominalLen||p.len,p.category,p.jointType].map(x=>typeof x==='number'?round(x):x);}),launch:round(offset(sh,'launch')),arrival:[a.mode,...[a.tip,a.push,a.R,a.off].map(round)]});
}
function build(d,settings=standard()){
 validate(settings); const rt=route(d),sh=d.shaft||{},spec=specAt(d,rt,rt.total),arr=arrival(sh,spec.outer,rt.total),launch=offset(sh,'launch');
 if(arr.tip<=launch)throw Error('押切位置が発進坑口以前です。到達条件を確認してください。');
 if(arr.mode==='inner'&&rt.segs.some(g=>g.k&&g.s+g.L>arr.tip-spec.len))throw Error('到達部が曲線です。個別の停止位置を指定してください。');
 const pitch=+(d.pipe?.dia||d.pipe?.size)>=800?10:5;
 let frontS=arr.tip;const pipes=[],joints=[];
 const makePipe=(frontS,no)=>{
  const sp=specAt(d,rt,frontS),front=rt.at(frontS);let lo=0,hi=Math.min(frontS,sp.len*1.6);
  if(hi===frontS&&Math.hypot(front.X-rt.at(0).X,front.Y-rt.at(0).Y)<sp.len)lo=hi;
  else {if(Math.hypot(front.X-rt.at(frontS-hi).X,front.Y-rt.at(frontS-hi).Y)<sp.len)throw Error('曲線が管長に対して急すぎます。');for(let j=0;j<55;j++){const mid=(lo+hi)/2,q=rt.at(frontS-mid);if(Math.hypot(front.X-q.X,front.Y-q.Y)<sp.len)lo=mid;else hi=mid;}}
  const rearS=Math.max(0,frontS-(lo+hi)/2),rear=rt.at(rearS),len=Math.hypot(front.X-rear.X,front.Y-rear.Y),th=Math.atan2(front.Y-rear.Y,front.X-rear.X);
  const crossed=rt.segs.filter(g=>g.s>rearS+1e-6&&g.s<frontS-1e-6).map(g=>g.label);
  return {no,frontS,rearS,front,rear,th,...sp,len,nominalLen:sp.len,crossed,partial:len<sp.len-1e-6};
 };
 for(let no=1;frontS>1e-7;no++){
  if(no>10000)throw Error('管本数が10000本を超えます。管長と延長を確認してください。');
  const pp=makePipe(frontS,no);pipes.push(pp);if(pp.rearS<1e-7)break;
  const mat=material(settings,no,pitch);let backS=pp.rearS-mat.cushion/1000,next;
  // 後方管の端面を前方管の座標系へ変換する。全周材と上下90°材の全頂点が端面の手前に収まるまで離す。
  // 上下材の平面投影は |y|≦外半径/√2。側方面の厚さだけで間隔を決めると、この追加層が管へめり込む。
  const gapAt=s=>{
   const q=makePipe(Math.max(s,1e-9),no+1),dx=pp.rear.X-q.front.X,dy=pp.rear.Y-q.front.Y,delta=q.th-pp.th,cs=Math.cos(delta);
   if(cs<.1)throw Error('管の折れ角が大きすぎます。');
   const center=(dx*Math.cos(q.th)+dy*Math.sin(q.th))/cs,slope=Math.tan(delta),spread=pp.outer/2*Math.abs(slope);
   const full=center-spread-mat.cushion/1000,upper=center-spread/Math.SQRT2-mat.maximum/1000;
   return {q,center,slope,margin:Math.min(full,upper)};
  };
  const need=mat.maximum/1000;let lo=0,hi=Math.min(pp.rearS,need+(pp.outer+spec.outer)*2);
  if(gapAt(pp.rearS-hi).margin<0){throw Error('発進側の残りが目地だけになります。BP位置または材料構成を確認してください。');}
  for(let k=0;k<50;k++){const mid=(lo+hi)/2,z=gapAt(pp.rearS-mid);if(z.margin<0)lo=mid;else hi=mid;}
  backS=pp.rearS-(lo+hi)/2;const z=gapAt(backS);next=z.q;
  joints.push({no,p:pp.rearS,backS,frontPipe:pp,nextPipe:next,mat,left:(z.center-pp.outer/2*z.slope)*1000,right:(z.center+pp.outer/2*z.slope)*1000,center:z.center*1000,angle:Math.abs(next.th-pp.th)*180/Math.PI});
  frontS=backS;
 }
 if(settings.ranges.some(r=>r.to>joints.length))throw Error('再割付後の最終目地は'+joints.length+'です。範囲を修正してください。');
 return {rt,arr,launch,pipes,joints,settings,pitch,project:d};
}
const COLORS={PB:'#aa793b',A:'#2563eb',B:'#dc4b3f'},COL=['#2563eb','#dc4b3f','#14834e','#8344ba'];
function color(L,m){return m.pattern==='PB'?COLORS.PB:COL[L.settings.patterns.findIndex(p=>p.name===m.pattern)%COL.length];}
function polygon(pp,a,b,r){const u={x:Math.cos(pp.th),y:Math.sin(pp.th)},n={x:-u.y,y:u.x};return [[a,-r],[b,-r],[b,r],[a,r]].map(([x,y])=>[pp.rear.X+u.x*x+n.x*y,pp.rear.Y+u.y*x+n.y*y]);}
// 材料を描画と干渉検査で共用。端面に貼った平行な矩形のままにし、目地のくさび形へ変形させない。
function materialPolygons(j,pitch){
 const p=j.frontPipe,m=j.mat,u={x:Math.cos(p.th),y:Math.sin(p.th)},n={x:-u.y,y:u.x},layers=[];
 if(m.pul&&m.thick-m.crush>0)layers.push({kind:'PB',thick:m.thick-m.crush});
 if(m.p)for(let k=0;k<m.p.ls;k++)layers.push({kind:'FJ',thick:pitch});
 const shapes=[];let depth=0;
 for(const layer of layers){
  for(const side of [-1,1]){
   const pts=[[depth,p.inner/2],[depth+layer.thick/1000,p.inner/2],[depth+layer.thick/1000,p.outer/2],[depth,p.outer/2]].map(([d,r])=>[p.rear.X-u.x*d+n.x*r*side,p.rear.Y-u.y*d+n.y*r*side]);
   shapes.push({...layer,side,points:pts});
  }
  depth+=layer.thick/1000;
 }
 // 上下面にだけ追加した90°材を平面へ投影。全周材の後ろへ重ね、厚さは変形させない。
 if(m.p)for(let k=0;k<m.p.lc-m.p.ls;k++){
  const r=p.outer/(2*Math.SQRT2),pts=[[depth,-r],[depth+pitch/1000,-r],[depth+pitch/1000,r],[depth,r]].map(([d,y])=>[p.rear.X-u.x*d+n.x*y,p.rear.Y-u.y*d+n.y*y]);
  shapes.push({kind:'FJ',projection:true,side:0,thick:pitch,points:pts});depth+=pitch/1000;
 }
 return shapes;
}
function svg(L){
 const all=L.pipes.flatMap(p=>polygon(p,0,p.len,p.outer/2));if(L.arr.R){const c=L.rt.at(L.arr.center);all.push([c.X-L.arr.R,c.Y-L.arr.R],[c.X+L.arr.R,c.Y+L.arr.R]);}
 const minX=Math.min(...all.map(p=>p[0])),maxX=Math.max(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxY=Math.max(...all.map(p=>p[1])),pad=Math.max(1,(maxX-minX)*.025),W=maxX-minX+pad*2,H=maxY-minY+pad*2;
 const path=pts=>'M'+pts.map(p=>p.map(v=>f(v,6)).join(',')).join(' L')+' Z',lw=.0012;
 let h=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX-pad} ${minY-pad} ${W} ${H}" class="pl-drawing pl-overview" role="img" aria-label="実寸管割付図" style="display:block;width:100%;height:100%;background:white;touch-action:none"><style>
.pl-drawing,.pl-drawing *{user-select:none;-webkit-user-select:none;caret-color:transparent}
.pl-drawing [data-pipe]:focus{outline:none}
.pl-drawing [data-pipe]:focus-visible .pl-outer{stroke:#c02626}
.pl-outer{stroke-width:2.4px;vector-effect:non-scaling-stroke}
.pl-inner{stroke-width:1px;vector-effect:non-scaling-stroke}
.pl-overview .pl-outer{fill:#e2e8f0}
.pl-overview .pl-inner,.pl-overview .pl-collar,.pl-overview [data-joint],.pl-overview .pl-survey{display:none}
.pl-section .pl-outer{fill:#d9e1e8}
.pl-number{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round;vector-effect:non-scaling-stroke;pointer-events:none}
.pl-selected .pl-outer{stroke:#c02626;fill:#fee2e2}
</style><defs><pattern id="plh" width=".04" height=".04" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V.04" stroke="#c8ced3" stroke-width=".008"/></pattern></defs>`;
 L.pipes.forEach(p=>{
  const mat=L.joints[p.no-1]?.mat||material(L.settings,p.no,L.pitch),c=color(L,mat),poly=(a,b,r,fill,stroke,cls)=>`<path class="${cls}" d="${path(polygon(p,a,b,r))}" fill="${fill}" stroke="${stroke}" stroke-width="${lw}"/>`;
  // 輪郭線を管体の内側で切り抜く。線幅を大きくしても目地・材料へはみ出させない。
  h+=`<defs><clipPath id="pipeclip${p.no}"><path d="${path(polygon(p,0,p.len,p.outer/2))}"/></clipPath></defs><g data-pipe="${p.no}" tabindex="0" role="button" aria-label="${p.no}本目"><title>${p.no}本目 有効長${f(p.len)}m</title><g clip-path="url(#pipeclip${p.no})">`+poly(0,p.len,p.outer/2,'url(#plh)',c,'pl-outer')+poly(0,p.len,p.inner/2,'#fff','#475569','pl-inner');
  const ca=catalog(p),ci=Math.min(ca?ca.lc1/1000:.12,p.len/4);
  h+=`<path class="pl-collar" d="${path(polygon(p,0,ci,p.outer/2))} ${path(polygon(p,0,ci,p.inner/2))}" fill="#94a3b844" fill-rule="evenodd" stroke="none"/>`+'</g>';
  const cc={X:(p.front.X+p.rear.X)/2,Y:(p.front.Y+p.rear.Y)/2};h+=`<text class="pl-number" x="${cc.X}" y="${cc.Y}" font-size=".12" fill="#183550" text-anchor="middle" dominant-baseline="middle">${p.no}</text></g>`;
 });
 L.joints.forEach(j=>{
  const m=j.mat,c=color(L,m);
  h+=`<g data-joint="${j.no}"><title>目地${j.no} 左${f(j.left,1)}mm 右${f(j.right,1)}mm（材料は変形させず描画）</title>`;
  for(const shape of materialPolygons(j,L.pitch))h+=`<path data-material="${shape.kind}" d="${path(shape.points)}" fill="${shape.kind==='PB'?'#aa793b':c}" fill-opacity="${shape.projection?.45:1}" stroke="none"><title>${shape.projection?'上下90°材の平面投影':'全周材の平面断面'} 厚さ${shape.thick}mm</title></path>`;
  const prev=L.joints[j.no-2]?.mat;
  if(!prev||prev.pattern!==m.pattern||prev.pul!==m.pul){const p=j.frontPipe,x=(p.front.X+p.rear.X)/2,y=(p.front.Y+p.rear.Y)/2-p.outer/2-.3;h+=`<text x="${x}" y="${y}" font-size=".2" text-anchor="middle" fill="${c}">${esc(m.pattern==='PB'?(m.pul?'パル':'なし'):m.pattern)}</text>`;}
  h+='</g>';
 });
 const label=(s,txt,c,row=0)=>{const q=L.rt.at(s),y=q.Y+Math.max(...L.pipes.map(p=>p.outer))/2+.25+row*.25;return `<g class="pl-survey"><circle cx="${q.X}" cy="${q.Y}" r=".035" fill="${c}"/><path d="M${q.X} ${q.Y+.1}V${y-.16}" fill="none" stroke="${c}" stroke-width=".004"/><text x="${q.X}" y="${y}" font-size=".16" fill="${c}" text-anchor="middle">${txt}</text></g>`;};
 h+=label(0,'BP','#334155')+label(L.launch,'発進坑口','#334155')+label(L.rt.total-L.arr.off,'到達坑口','#334155');
 L.rt.segs.filter(g=>g.k).forEach(g=>{h+=label(g.s,'BC'+g.curveNo,'#334155')+label(g.s+g.L,'EC'+g.curveNo,'#334155');});
 if(L.arr.R){const c=L.rt.at(L.arr.center),p=L.pipes[0],u={x:Math.cos(p.th),y:Math.sin(p.th)},n={x:-Math.sin(p.th),y:Math.cos(p.th)},cut=[];
  for(let k=0;k<=60;k++){const y=-p.outer/2+p.outer*k/60,x=-Math.sqrt(Math.max(0,L.arr.R**2-y*y));cut.push([c.X+u.x*x+n.x*y,c.Y+u.y*x+n.y*y]);}
  const b=polygon(p,p.len,p.len,p.outer/2),area=[...cut,[b[2][0],b[2][1]],[b[1][0],b[1][1]]];
  h+=`<circle cx="${c.X}" cy="${c.Y}" r="${L.arr.R}" fill="none" stroke="#64748b" stroke-width=".015"/><path d="${path(area)}" fill="#ef4444" fill-opacity=".25"/><path d="M${cut.map(q=>q.join(',')).join(' L')}" fill="none" stroke="#dc2626" stroke-width=".012" stroke-dasharray=".03 .02"/>`;
  h+=label(L.arr.center,'到達人孔芯','#dc2626',2);
 }
 h+=label(L.arr.tip,'押切端面','#dc2626',1);return h+'</svg>';
}

function updateDisplay(svg,L){
 const scale=Math.abs(svg.getScreenCTM()?.a)||1;
 const diameter=Math.min(...L.pipes.map(p=>p.outer))*scale;
 const mode=diameter<28?'overview':diameter<80?'section':'detail';
 svg.classList.remove('pl-overview','pl-section','pl-detail-view');
 svg.classList.add(mode==='detail'?'pl-detail-view':'pl-'+mode);
 svg.dataset.display=mode;
 const pitch=Math.min(...L.pipes.filter(p=>!p.partial).map(p=>p.len))*scale;
 const stride=[1,5,10,20,50,100,200,500,1000].find(n=>n*pitch>=42)||1000;
 svg.querySelectorAll('[data-pipe]').forEach(g=>{
  const p=L.pipes[+g.dataset.pipe-1],t=g.querySelector('.pl-number');
  if(!t)return;
  t.style.display=(p.no===1||p.no%stride===0||g.classList.contains('pl-selected'))?'':'none';
  t.setAttribute('font-size',12/scale);
  t.setAttribute('dy',mode==='overview'?-p.outer/2-9/scale:0);
 });
 return mode;
}
function catalog(p){
 const dia=Math.round(p.inner*1000),ja=p.jointType===30,jc=p.jointType===60;
 if(p.category!=='hume'&&p.category!=='rc'&&p.category) return null;
 if(dia<800||dia>3000||(!ja&&!jc))return null;
 const ds=[800,900,1000,1100,1200,1350,1500,1650,1800,2000,2200,2400,2600,2800,3000],i=ds.indexOf(dia);if(i<0)return null;
 const dc=[951,1071,1191,1301,1421,1588,1768,1938,2108,2338,2568,2792,3022,3252,3482][i];
 return {kind:ja?'JA':'JC',d1:ja?[933,1053,1173,1283,1403,1563,1743,1913,2083,2313,2543,2763,2993,3223,3453][i]:[930,1050,1170,1280,1400,1560,1740,1910,2080,2310,2540,2760,2990,3220,3450][i],d2:ja?[942,1062,1182,1292,1412,1577,1757,1927,2097,2327,2557,2779,3009,3239,3469][i]:[938,1058,1178,1288,1408,1568,1748,1918,2088,2318,2548,2768,2998,3228,3458][i],dc,tc:dia<=1200?4.5:dia<2400?6:9,lc1:ja?(dia<2400?120:150):150,lc2:ja?(dia<2400?130:150):170};
}
function detail(L,no){
 const p=L.pipes[no-1],j=L.joints[no-1],ca=catalog(p),m=j?.mat;
 let h=`<b>${no}本目</b>：有効長 ${f(p.len)}m${p.partial?'（発進側に必要な端数有効長）':''}／外径 ${f(p.outer*1000,0)}mm／内径 ${f(p.inner*1000,0)}mm<br>発進坑口から 前端 ${f(p.frontS-L.launch)}m・後端 ${f(p.rearS-L.launch)}m`;
 if(p.crossed.length)h+='<br>区間境界をまたぐ管：'+p.crossed.map(esc).join('・');
 if(!j)return h+'<br>最終管の後ろには目地を作りません。';
 h+=`<br><b>目地 ${no}/${no+1}</b>：左 ${f(j.left,2)}mm・右 ${f(j.right,2)}mm・折れ角 ${f(j.angle,4)}°<br>${esc(m.pattern==='PB'?'パルリングのみ':'パターン '+m.pattern)}／パルリング ${m.pul?'1枚 '+m.thick+'mm・つぶれ代 '+m.crush+'mm':'なし'}${m.p?'／FJ側方面 '+m.p.ls*L.pitch+'mm（無圧縮）':''}`;
 const D=p.outer*1000,di=p.inner*1000,scale=260/D,cx=170,cy=180,ro=D/2*scale,ri=di/2*scale;
 h+=`<svg viewBox="0 0 780 350" style="display:block;width:100%;max-height:350px;background:#fff" role="img" aria-label="選択目地の平面断面と環状形状"><text x="30" y="25" fill="#24415c">環状形状（正面・管壁に貼付け）</text><circle cx="${cx}" cy="${cy}" r="${ro}" fill="#a87b45" stroke="#573b21"/><circle cx="${cx}" cy="${cy}" r="${ri}" fill="#fff" stroke="#573b21"/>`;
 if(!m.pul)h+=`<circle cx="${cx}" cy="${cy}" r="${(ri+ro)/2}" fill="none" stroke="#fff" stroke-width="${ro-ri}"/>`;
 if(m.p)h+=`<circle cx="${cx}" cy="${cy}" r="${(ri+ro)/2}" fill="none" stroke="${color(L,m)}" stroke-width="${ro-ri}"/>`;
 h+=`<text x="170" y="185" text-anchor="middle" font-size="16">内径 ${di}mm</text><text x="30" y="335" font-size="14">外径 ${D}mm／管厚 ${f((D-di)/2,0)}mm</text>`;
 // 平面断面にも本図と同じ管端・材料ポリゴンを用いる。開口差の見せ方による見かけのめり込みを防ぐ。
 const u={x:Math.cos(p.th),y:Math.sin(p.th)},n={x:-u.y,y:u.x},k=260/p.outer;
 const project=q=>[550-((q[0]-p.rear.X)*u.x+(q[1]-p.rear.Y)*u.y)*k,180+((q[0]-p.rear.X)*n.x+(q[1]-p.rear.Y)*n.y)*k];
 const dpath=pts=>'M'+pts.map(project).map(q=>q.map(v=>f(v,3)).join(',')).join(' L')+' Z';
 for(const [pp,a,b] of [[p,0,Math.min(.55,p.len)],[j.nextPipe,Math.max(0,j.nextPipe.len-.55),j.nextPipe.len]]){
  h+=`<path d="${dpath(polygon(pp,a,b,pp.outer/2))} ${dpath(polygon(pp,a,b,pp.inner/2))}" fill="#e2e8f0" fill-rule="evenodd" stroke="#53677a" stroke-width=".35"/>`;
 }
 for(const shape of materialPolygons(j,L.pitch))h+=`<path d="${dpath(shape.points)}" fill="${shape.kind==='PB'?'#aa793b':color(L,m)}" fill-opacity="${shape.projection?.45:1}"/>`;
 if(ca)for(const side of [-1,1]){
  const r=(ca.dc/2+ca.tc/2)/1000,aa=[p.rear.X+u.x*ca.lc1/1000+n.x*r*side,p.rear.Y+u.y*ca.lc1/1000+n.y*r*side],bb=[p.rear.X-u.x*ca.lc2/1000+n.x*r*side,p.rear.Y-u.y*ca.lc2/1000+n.y*r*side];
  const q0=project(aa),q1=project(bb);h+=`<path d="M${q0.join(',')}L${q1.join(',')}" fill="none" stroke="#475569" stroke-width="${ca.tc/1000*k}"/>`;
 }
 h+=`<text x="365" y="25" font-size="16">平面断面（縦横同縮尺・無圧縮配置）</text><text x="365" y="165" font-size="14">左 ${f(j.left,2)}mm ／ 右 ${f(j.right,2)}mm</text><text x="365" y="205" font-size="14">茶：パルリング　青等：FJ</text><text x="365" y="230" font-size="14">灰：カラー（取付部は模式）</text></svg>`;
 h+=ca?`<small>継手${ca.kind}参考寸法：D1=${ca.d1}・D2=${ca.d2}・Dc=${ca.dc}・Tc=${ca.tc}・Lc1=${ca.lc1}・Lc2=${ca.lc2}mm。ゴム断面と上図のカラー周辺は模式。<a href="https://harima-con.co.jp/image/about_hume_pipe/hp_manual_all.pdf" target="_blank" rel="noopener">設計施工要覧 表1.3.8.1-1／1.3.8.2-1</a></small>`:'<small>この管種・継手の製品詳細寸法は未収録です。管体と開口のみを実寸で算定します。</small>';
 return h;
}
const api={updateDisplay,offset,arrival,route,standard,material,validate,build,svg,detail,catalog,esc,materialPolygons,polygon,signature};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.PipeLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
