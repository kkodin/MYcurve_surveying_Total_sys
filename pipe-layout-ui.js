/* 実寸管割の入力・SVG操作。既存の照査画面へ組み込む。 */
(function(root){
'use strict';
function mount(host,project,settings,hooks={}){
 const PL=root.PipeLayout,E=PL.esc;
 let state=JSON.parse(JSON.stringify(settings||PL.standard())),layout=null,selected=1,view=null;
 host.innerHTML=`<style>
 .pl-controls,.pl-edit{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:10px 0}.pl-edit{padding:10px;background:#f3f6fa;border-radius:8px}.pl-edit label{display:flex;flex-direction:column;gap:3px;font-size:14px;color:#25405a}.pl-edit input,.pl-edit select,.pl-controls input{font:inherit;min-height:34px;width:100px;padding:4px;border:1px solid #aebccc;border-radius:5px}.pl-edit select{width:145px}.pl-controls button,.pl-edit button{font-size:14px;min-height:36px;cursor:pointer;border:1px solid #aebccc;border-radius:5px;background:white;color:#183550;padding:5px 10px}.pl-view{height:460px;border:1px solid #aebccc;border-radius:7px;overflow:hidden;background:#fff}.pl-detail{line-height:1.7;border:1px solid #d8e1eb;padding:12px;border-radius:7px;margin-top:12px;font-size:14px}.pl-note{line-height:1.7;font-size:14px;color:#36546d}.pl-error{color:#b42318;background:#fff0ee;padding:10px;border-radius:6px}.pl-ready{padding:10px;background:#eaf7ef;border-radius:6px}.pl-edit b{min-width:80px}@media(max-width:600px){.pl-view{height:360px}.pl-edit label{flex:1}.pl-edit input,.pl-edit select{width:100%}}
 </style><h2>管割付図（押切位置から割付）</h2>
 <p class="pl-note">管種と線形から作る配置検討図です。初期状態は標準パルリング1枚・10mm、つぶれ代0mm。FJは無圧縮厚で描きます。荷重下の変形・強度は「指定した管割で照査」で別途確認します。</p>
 <div data-pl="summary"></div>
 <div class="pl-controls"><button type="button" data-pl="fit">全体</button><button type="button" data-pl="plus">拡大</button><button type="button" data-pl="minus">縮小</button><label>管番号 <input type="number" min="1" step="1" value="1" data-pl="number"></label><button type="button" data-pl="jump">この管へ</button><button type="button" data-pl="save">図を保存</button></div>
 <div class="pl-note">図上の管を押すと目地詳細を表示します。ドラッグで移動、ホイール・2本指で拡大縮小。</div>
 <div class="pl-note" data-pl="display" aria-live="polite"></div><div class="pl-view" data-pl="view"></div><div class="pl-detail" data-pl="detail"></div>
 <details><summary style="cursor:pointer;padding:12px 0;font-weight:600">管ごとの寸法と目地開き</summary><div data-pl="table" style="max-height:360px;overflow:auto"></div></details>
 <h3>組合せパターン</h3><p class="pl-note">全周の層を左右にも貼り、残りは上下面に貼ります。パターンの変更は、そのパターンを指定した範囲すべてに反映します。</p>
 <div data-pl="patterns"></div><div class="pl-controls"><button type="button" data-pl="addPattern">パターンを追加</button></div>
 <h3>管番号の範囲ごとに伝達材を指定</h3><p class="pl-note">「1〜30」は1本目の後ろから30本目の後ろ（目地1/2〜30/31）までです。未指定部は標準パルリング1枚・10mm・つぶれ代0mm。範囲を変えた後は「図を更新」で確定します。</p>
 <div data-pl="ranges"></div><div class="pl-controls"><button type="button" data-pl="addRange">範囲を追加</button><button type="button" data-pl="apply">図を更新</button><button type="button" data-pl="check">指定した管割で照査</button></div><div data-pl="status" aria-live="polite"></div>`;
 const el=k=>host.querySelector('[data-pl="'+k+'"]');
 const status=(s,bad)=>{el('status').className=bad?'pl-error':'pl-ready';el('status').textContent=s;};
 const nfield=(label,value,key,step=1)=>`<label>${label}<input type="number" min="0" step="${step}" data-field="${key}" value="${E(value)}"></label>`;
 const mats=v=>[11,12,13,14,15].map((n,i)=>`<option value="${n}" ${+v===n?'selected':''}>FJ ${[1.7,2,2.5,3,3.5][i]}倍</option>`).join('');
 const dirty=()=>{hooks.onDirty?.();status('入力を変更しました。「図を更新」で再割付してください。');};
 function editors(){
  el('patterns').innerHTML=state.patterns.map((p,i)=>`<div class="pl-edit" data-pat="${i}"><b>パターン ${E(p.name)}</b><label>上下面の材種<select data-field="mc">${mats(p.mc)}</select></label>${nfield('上下面の層数',p.lc,'lc')}<label>左右の材種<select data-field="ms">${mats(p.ms)}</select></label>${nfield('全周の層数',p.ls,'ls')}<button type="button" data-del-pat="${i}">削除</button></div>`).join('');
  el('ranges').innerHTML=state.ranges.map((r,i)=>`<div class="pl-edit" data-range="${i}">${nfield('開始目地（管番号）',r.from,'from')}${nfield('終了目地（管番号）',r.to,'to')}<label>組合せ<select data-field="pattern"><option value="PB">パルリングのみ</option>${state.patterns.map(p=>`<option value="${E(p.name)}" ${p.name===r.pattern?'selected':''}>パターン ${E(p.name)}</option>`).join('')}</select></label><label>パルリング<select data-field="pul"><option value="1" ${r.pul?'selected':''}>1枚</option><option value="0" ${r.pul?'':'selected'}>なし</option></select></label>${nfield('厚さ [mm]',r.thick,'thick',.5)}${nfield('つぶれ代 [mm]',r.crush,'crush',.1)}<button type="button" data-del-range="${i}">削除</button></div>`).join('');
  host.querySelectorAll('[data-pat] [data-field],[data-range] [data-field]').forEach(inp=>{const update=()=>{const row=inp.closest('[data-pat],[data-range]'),o=row.hasAttribute('data-pat')?state.patterns[+row.dataset.pat]:state.ranges[+row.dataset.range],k=inp.dataset.field;o[k]=k==='pul'?inp.value==='1':k==='pattern'?inp.value:+inp.value;dirty();};inp.addEventListener('input',update);inp.addEventListener('change',update);});
  host.querySelectorAll('[data-del-pat]').forEach(b=>b.onclick=()=>{state.patterns.splice(+b.dataset.delPat,1);editors();dirty();});
  host.querySelectorAll('[data-del-range]').forEach(b=>b.onclick=()=>{state.ranges.splice(+b.dataset.delRange,1);editors();dirty();});
 }
 function display(){const svg=el('view').querySelector('svg');if(!layout||!svg)return;const mode=PL.updateDisplay(svg,layout);el('display').textContent=mode==='overview'?'全体表示：外郭を強調（内径線・継手・材料は拡大すると表示）':mode==='section'?'管断面表示：内径線・継手・材料を表示（さらに拡大すると管壁ハッチを表示）':'詳細表示：管壁・目地・材料を実寸で表示';}
 function setView(v){if(!layout)return;view=v;el('view').querySelector('svg').setAttribute('viewBox',[v.x,v.y,v.w,v.h].join(' '));display();}
 function zoom(k,c){if(!view)return;const w=view.w*k,h=view.h*k;if(w<.15||w>20000)return;const p=c||{x:view.x+view.w/2,y:view.y+view.h/2},rx=(p.x-view.x)/view.w,ry=(p.y-view.y)/view.h;setView({x:p.x-w*rx,y:p.y-h*ry,w,h});}
 function select(no,jump){if(!layout)return;if(!Number.isInteger(no)||no<1||no>layout.pipes.length){status('管番号は1〜'+layout.pipes.length+'で指定してください。',true);return;}selected=no;el('number').value=no;el('detail').innerHTML=PL.detail(layout,no);el('view').querySelectorAll('[data-pipe]').forEach(g=>{g.classList.toggle('pl-selected',+g.dataset.pipe===no);const t=g.querySelector('text');if(t){t.setAttribute('fill',+g.dataset.pipe===no?'#dc2626':'#183550');t.setAttribute('font-weight',+g.dataset.pipe===no?'700':'400');}});display();if(jump){const p=layout.pipes[no-1],w=Math.max(5,p.len*3),h=w*el('view').clientHeight/Math.max(1,el('view').clientWidth);setView({x:(p.front.X+p.rear.X)/2-w/2,y:(p.front.Y+p.rear.Y)/2-h/2,w,h});}}
 function interactions(){
  const svg=el('view').querySelector('svg'),pointers=new Map();let moved=false,down=null,lastPinch=null;
  const world=(x,y)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(svg.getScreenCTM().inverse());};
  svg.onselectstart=e=>e.preventDefault();
  svg.onpointerdown=e=>{e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});svg.setPointerCapture(e.pointerId);down={x:e.clientX,y:e.clientY,target:e.target};moved=false;};
  svg.onpointermove=e=>{if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId),a=world(old.x,old.y),b=world(e.clientX,e.clientY);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.size===2){const ps=[...pointers.values()],distance=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);if(lastPinch)zoom(lastPinch/distance,world((ps[0].x+ps[1].x)/2,(ps[0].y+ps[1].y)/2));lastPinch=distance;moved=true;}
   else {if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)moved=true;if(moved)setView({...view,x:view.x+a.x-b.x,y:view.y+a.y-b.y});}
  };
  const up=e=>{pointers.delete(e.pointerId);lastPinch=null;if(!moved&&down){const g=down.target.closest('[data-pipe]');if(g)select(+g.dataset.pipe);}down=null;};svg.onpointerup=up;svg.onpointercancel=()=>{pointers.clear();lastPinch=null;down=null;};
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?.8:1.25,world(e.clientX,e.clientY));},{passive:false});
  svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const g=e.target.closest('[data-pipe]');if(g){e.preventDefault();select(+g.dataset.pipe);}}});
 }
 function render(){
  try{
   const fresh=PL.build(project,state);layout=fresh;hooks.onApply?.(JSON.parse(JSON.stringify(state)),fresh);
   el('view').innerHTML=PL.svg(layout);const box=el('view').querySelector('svg').viewBox.baseVal;view={x:box.x,y:box.y,w:box.width,h:box.height};el('fit').onclick=()=>{el('view').querySelector('svg').setAttribute('viewBox',[box.x,box.y,box.width,box.height].join(' '));};
   const initial={...view};el('fit').onclick=()=>setView(initial);interactions();select(Math.min(selected,layout.pipes.length));
   const a=layout.arr;el('summary').className='pl-ready';el('summary').innerHTML=`管 ${layout.pipes.length}本・目地 ${layout.joints.length}か所／押切位置：発進坑口から ${a.tip-layout.launch>=0?f(a.tip-layout.launch):'—'}m<br>到達坑口からの押込み ${f(a.push)}m`+(a.mode==='inner'?`／人孔芯の手前 ${f(a.a)}m／管欠損長 ${f(a.missing)}m（赤：取壊し、赤破線：内面加工線）`:a.mode==='open'?'／到達立坑内は空伏管（図の推進管には含めません）':'／個別指定の停止位置');
   el('table').innerHTML='<table><thead><tr><th>管番号</th><th>有効長[m]</th><th>後端距離[m]</th><th>左開口[mm]</th><th>右開口[mm]</th><th>指定</th></tr></thead><tbody>'+layout.pipes.map((p,i)=>`<tr><td>${p.no}</td><td>${f(p.len)}</td><td>${f(p.rearS-layout.launch)}</td><td>${layout.joints[i]?f(layout.joints[i].left,2):'—'}</td><td>${layout.joints[i]?f(layout.joints[i].right,2):'—'}</td><td>${E(layout.joints[i]?.mat.pattern||'—')}</td></tr>`).join('')+'</tbody></table>';
   status('配置検討図を更新しました。強度・荷重下の変形は未照査です。');return layout;
  }catch(e){layout=null;hooks.onDirty?.();el('view').innerHTML='';el('detail').innerHTML='';el('summary').innerHTML='';el('table').innerHTML='';status(e.message,true);return null;}
 }
 el('addPattern').onclick=()=>{let name;for(let i=0;i<26;i++){name=String.fromCharCode(65+i);if(!state.patterns.some(p=>p.name===name))break;}if(state.patterns.some(p=>p.name===name)){status('パターンは26個までです。',true);return;}state.patterns.push({name,mc:12,lc:2,ms:12,ls:1});editors();dirty();};
 el('addRange').onclick=()=>{const from=state.ranges.length?Math.max(...state.ranges.map(r=>r.to))+1:1;state.ranges.push({from,to:from,pattern:'PB',pul:true,thick:10,crush:0});editors();dirty();};
 el('apply').onclick=render;el('plus').onclick=()=>zoom(.6);el('minus').onclick=()=>zoom(1/.6);el('jump').onclick=()=>select(+el('number').value,true);
 el('save').onclick=()=>{if(!layout)return;const s=el('view').querySelector('svg').cloneNode(true);s.setAttribute('viewBox',view.x+' '+view.y+' '+view.w+' '+view.h);s.setAttribute('width','1600');s.setAttribute('height','900');s.style.width='1600px';s.style.height='900px';const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s)],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download='管割付図.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 el('check').onclick=async()=>{const L=render();if(!L)return;try{await hooks.onCheck?.(L);status(hooks.onCheck?'照査結果を下の管割付表で確認してください。':'推進力が未計算です。配置検討図として保存できます。');}catch(e){status(e.message,true);}};
 new ResizeObserver(()=>display()).observe(el('view'));editors();render();
 return {getSettings:()=>JSON.parse(JSON.stringify(state)),getLayout:()=>layout,render};
}
function f(x,n=3){return Number(x).toFixed(n);}
root.PipeLayoutUI={mount};
})(globalThis);
