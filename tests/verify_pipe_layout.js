const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),P=require('../pipe-layout');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function project(dir='R',s=false){return {build:'M_APP_048',site:{name:'合成試験_管割付',span:'検証専用',date:'2026-11-23'},method:'blade',pipe:{specVersion:2,category:'hume',dia:'800',grade:'1shu',strength:70,outer:.96,inner:.8,thick:.08,len:1.2,jointType:30,pulRingUse:true,pulRingThickness:10,crush:0,cushionSigmaAllow:35},soil:{type:'clay',gamma:18,phi:20,phiPipe:15,C:25,N:5,Nprime:1,Hmin:2,Hmax:4,adh:5,alpha:0.5,beta:0,foFormula:'yamato'},alignment:{seg_L0:30,finalL:60,curves:[{R:60,dir,deg:30,min:0,sec:0,L:0},...(s?[{R:70,dir:dir==='R'?'L':'R',deg:25,min:0,sec:0,L:55}]:[])]},shaft:{launchMode:'direct',launchDirect:1.25,arrivalMode:'shape',arrivalType:'manhole',manholeSize:1.2,manholeGrade:1,arrivalStopMode:'inner',arrivalInnerD:1.2},jack:{capUnit:1000,count:2}};}
const straight=project();straight.alignment={seg_L0:20,finalL:20,curves:[]};
const a=P.arrival(straight.shaft,.96,40);near(a.a,.36);near(a.missing,.24);near(a.tip,39.64);near(a.push,.34);
const st=P.build(straight);assert.equal(st.pipes.length,33);near(st.pipes[0].frontS,39.64);near(st.pipes[0].rearS,38.44);st.joints.forEach(j=>{near(j.left,10);near(j.right,10);});
const same=structuredClone(straight);same.shaft={...same.shaft,arrivalMode:'direct',arrivalDirect:.7};assert.equal(P.signature(straight),P.signature(same));same.shaft.arrivalInnerD=1.5;assert.notEqual(P.signature(straight),P.signature(same));
near(st.pipes.at(-1).rearS,0);assert.ok(st.pipes.at(-1).partial);near(st.pipes.at(-1).len,.92);
function check(L){
 assert.equal(L.joints.length,L.pipes.length-1);near(L.pipes[0].frontS,L.arr.tip);
 for(const p of L.pipes){near(Math.hypot(p.front.X-p.rear.X,p.front.Y-p.rear.Y),p.len);if(!p.partial)near(p.len,p.nominalLen);}
 for(const j of L.joints){assert.ok(j.left>=-1e-6&&j.right>=-1e-6);assert.ok(Math.min(j.left,j.right)>=j.mat.cushion-1e-6);if(!j.mat.p)near(Math.min(j.left,j.right),j.mat.cushion,1e-6);assert.equal(j.nextPipe.no,j.no+1);near(j.nextPipe.frontS,L.pipes[j.no].frontS);}
 // 実際に描く矩形材料と後方管体の凸多角形を独立した分離軸法で検査（接触は許容、面積を持つめり込みは不可）。
 const penetration=(a,b)=>{
  let depth=Infinity;
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
   const p=poly[i],q=poly[(i+1)%poly.length],len=Math.hypot(q[0]-p[0],q[1]-p[1]),n=[-(q[1]-p[1])/len,(q[0]-p[0])/len];
   const project=v=>v.map(p=>p[0]*n[0]+p[1]*n[1]),A=project(a),B=project(b),overlap=Math.min(Math.max(...A),Math.max(...B))-Math.max(Math.min(...A),Math.min(...B));depth=Math.min(depth,overlap);
  }return depth;
 };
 for(const j of L.joints)for(const mat of P.materialPolygons(j,L.pitch)){
  near(Math.hypot(mat.points[1][0]-mat.points[0][0],mat.points[1][1]-mat.points[0][1])*1000,mat.thick);
  const next=j.nextPipe;assert.ok(penetration(mat.points,P.polygon(next,0,next.len,next.outer/2))<1e-8,'材料が後方管へめり込む');
 }
 assert.ok(!P.svg(L).includes('NaN'));assert.ok(!P.detail(L,1).includes('NaN'));
}
const right=P.build(project()),left=P.build(project('L')),S=P.build(project('R',true));[st,right,left,S].forEach(check);
for(const rad of [8,15,30,100])for(const dir of ['L','R']){const d=project(dir);d.alignment.curves[0].R=rad;check(P.build(d));}
assert.equal(right.pipes.length,left.pipes.length);right.pipes.forEach((p,i)=>{near(p.front.X,left.pipes[i].front.X);near(p.front.Y,-left.pipes[i].front.Y);});
const c=right.joints.find(j=>j.angle>1);assert.ok(c);assert.ok(Math.abs(c.left-c.right)>15);assert.ok(right.pipes.some(p=>p.crossed.length));
const settings=P.standard();settings.ranges=[{from:1,to:20,pattern:'A',pul:false,thick:10,crush:0},{from:21,to:40,pattern:'B',pul:false,thick:10,crush:0},{from:41,to:50,pattern:'PB',pul:true,thick:10,crush:2}];
const assigned=P.build(project(),settings);check(assigned);assert.equal(assigned.joints[0].mat.pul,false);assert.equal(assigned.joints[20].mat.pattern,'B');near(assigned.joints[40].mat.cushion,8);near(assigned.pipes[0].frontS,right.pipes[0].frontS);assert.notEqual(assigned.pipes[45].frontS,right.pipes[45].frontS);
assert.deepEqual(P.build(project(),JSON.parse(JSON.stringify(settings))).joints.map(j=>j.p),assigned.joints.map(j=>j.p));
const invalid=JSON.parse(JSON.stringify(settings));invalid.ranges[1].from=20;assert.throws(()=>P.build(project(),invalid),/重複/);
invalid.ranges[1].from=21;invalid.ranges[2].crush=11;assert.throws(()=>P.build(project(),invalid),/つぶれ代/);
invalid.ranges[2].crush=2;invalid.ranges[2].to=1000;assert.throws(()=>P.build(project(),invalid),/最終目地/);
assert.throws(()=>P.arrival({...straight.shaft,arrivalInnerD:.9},.96,40),/内径/);
assert.throws(()=>P.arrival({...straight.shaft,arrivalInnerD:.96},.96,40),/内径/);
const open=project();open.shaft.arrivalStopMode='open';open.shaft.arrivalPushOut=.15;const ol=P.build(open);near(ol.arr.push,.15);near(ol.arr.tip,ol.rt.total-.7+.15);check(ol);
const varied=project();varied.alignment.straightSpecs=[{layoutSpec:{outer:.96,inner:.8,len:2.43,jointType:30,category:'hume'}},{layoutSpec:{outer:.96,inner:.8,len:1.2,jointType:30,category:'hume'}}];const vl=P.build(varied);check(vl);assert.ok(vl.pipes.some(p=>p.nominalLen===2.43));
assert.equal(P.catalog(right.pipes[0]).kind,'JA');assert.equal(P.catalog({...right.pipes[0],jointType:60}).lc2,170);assert.equal(P.catalog({...right.pipes[0],jointType:40}),null);
// 各HTMLの全インラインスクリプトを構文検査。
for(const name of ['M_APP_005.html','軸力検証ソフト_HTML版.html']){const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:name});}
if(process.argv.includes('--fixture'))fs.writeFileSync(path.join(__dirname,'..','..','試験用_合成路線.json'),JSON.stringify(project(),null,2));
console.log('PASS: 押切360mm・欠損240mm、直線・左右曲線・S字、実長・目地開き、A/B/パル区間、保存復元、空伏管、個別管長、不正入力、全HTML構文');
