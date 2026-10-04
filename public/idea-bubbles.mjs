const key='shixu-idea-bubbles';
const defaults={enabled:true,material:'solid',threeD:true,depth:55,autoFade:true,excluded:[],placement:'background',direction:'left',speed:100,density:4,size:100,color:'#a8cbbd',opacity:22,fontSize:16,fontColor:'#527265',fontOpacity:55};
const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
function clean(v={}){return {material:['solid','frosted','glass','acrylic','mica','paper'].includes(v?.material)?v.material:'solid',enabled:v?.enabled!==false,threeD:v?.threeD!==false,depth:clamp(v?.depth,0,100,55),autoFade:v?.autoFade!==false,excluded:Array.isArray(v?.excluded)?v.excluded.filter(x=>typeof x==='string').slice(0,3000):[],placement:v?.placement==='foreground'?'foreground':'background',direction:['left','right','up','down'].includes(v?.direction)?v.direction:'left',speed:clamp(v?.speed,25,200,100),density:Math.round(clamp(v?.density,1,6,4)),size:clamp(v?.size,60,160,100),color:/^#[a-f0-9]{6}$/i.test(v?.color)?v.color:defaults.color,opacity:clamp(v?.opacity,0,100,22),fontSize:clamp(v?.fontSize,12,32,16),fontColor:/^#[a-f0-9]{6}$/i.test(v?.fontColor)?v.fontColor:defaults.fontColor,fontOpacity:clamp(v?.fontOpacity,0,100,55)};}
let settings=read(),ideas=[],allIdeas=[],signature='',layer;
function read(){try{return clean(JSON.parse(localStorage.getItem(key)||'{}'));}catch{return {...defaults};}}
const rgba=(hex,alpha)=>`rgba(${hex.slice(1).match(/../g).map(x=>parseInt(x,16)).join(',')},${alpha/100})`;
function apply(){
 if(!layer)return;
 layer.hidden=!settings.enabled||!ideas.length;
 layer.dataset.placement=settings.placement;layer.dataset.direction=settings.direction;
 for(const bubble of layer.children){bubble.style.setProperty('--bubble-duration',`${Number(bubble.dataset.duration)*100/settings.speed}s`);bubble.style.animationDelay=`${-Number(bubble.dataset.phase)*Number(bubble.dataset.duration)*100/settings.speed}s`;}
 updateFocus();
 for(const target of [layer,document.querySelector('.bubble-preview')].filter(Boolean)){
 target.dataset.material=settings.material;target.style.setProperty('--bubble-alpha',String(settings.opacity/100));target.style.setProperty('--bubble-material-light',rgba('#ffffff',settings.opacity*.12));target.style.setProperty('--bubble-material-tint',rgba(settings.color,settings.opacity*.22));target.dataset.threeD=settings.threeD?'on':'off';
 const depth=settings.threeD?settings.depth/100:0;
 target.style.setProperty('--bubble-depth',String(depth));
 target.style.setProperty('--bubble-shine',String(depth*settings.opacity/100));
 target.style.setProperty('--bubble-shadow',rgba('#102c28',depth*settings.opacity*.38));
 target.style.setProperty('--bubble-tilt',`${depth*9}deg`);
 target.style.setProperty('--bubble-lift',`${depth*8}px`);
 target.style.setProperty('--bubble-width',`${240*settings.size/100}px`);
 target.style.setProperty('--bubble-padding',`${18*settings.size/100}px`);
 target.style.setProperty('--bubble-fill',rgba(settings.color,settings.opacity));
 target.style.setProperty('--bubble-text',rgba(settings.fontColor,settings.fontOpacity));
 target.style.setProperty('--bubble-font',`${settings.fontSize}px`);
 }
 const preview=document.querySelector('.bubble-preview span');if(preview)preview.textContent=ideas[0]?.text||'给突然冒出的好想法，留一点空间。';
}
export function syncIdeaBubbles(items=[]){
 if(!layer){layer=document.createElement('div');layer.id='idea-bubbles';layer.setAttribute('aria-hidden','true');document.querySelector('#shell').prepend(layer);}
 allIdeas=items;ideas=items.filter(x=>!settings.excluded.includes(x.id)).filter(x=>typeof x.text==='string'&&x.text.trim());
 const count=Math.min(ideas.length,settings.density,matchMedia('(max-width:620px)').matches?3:6);
 const next=JSON.stringify([count,ideas.map(x=>[x.id,x.text])]);
 if(next!==signature){signature=next;layer.replaceChildren();
  // A bounded number of compositor animations; each lane cycles through all ideas.
  for(let i=0;i<count;i++){
   const bubble=document.createElement('div');bubble.className='idea-bubble';
   let cursor=i;const text=document.createElement('span');
   const update=()=>{text.textContent=ideas[cursor%ideas.length]?.text||'';cursor+=count;};update();
   const face=document.createElement('div');face.className='bubble-face';face.append(text);bubble.append(face);bubble.style.setProperty('--bubble-turn',Math.random()>.5?'1':'-1');bubble.style.setProperty('--bubble-rock-time',`${12+Math.random()*10}s`);bubble.style.setProperty('--bubble-index',i);
   const scatter=()=>{const others=[...layer.children].filter(x=>x!==bubble).map(x=>parseFloat(x.style.getPropertyValue('--bubble-lane')));let lane=0;for(let attempt=0;attempt<20;attempt++){lane=4+Math.random()*72;if(others.every(x=>Math.abs(x-lane)>55/count))break;}bubble.style.setProperty('--bubble-lane',`${lane}%`);bubble.style.setProperty('--bubble-sway',`${Math.random()*48-24}px`);};scatter();
   bubble.dataset.duration=String(36+Math.random()*28);bubble.dataset.phase=String((i+Math.random()*.7)/count);
   bubble.style.setProperty('--bubble-duration',`${44+i*5}s`);
   bubble.style.animationDelay=`${-i*8-5}s`;
   bubble.addEventListener('animationiteration',event=>{if(event.target===bubble){update();scatter();}});layer.append(bubble);
  }
 }
 apply();
}
export function bubbleSettingsCard(){
 const s=settings;
 const select=(name,label,options)=>`<label>${label}<select name="${name}">${options.map(([v,l])=>`<option value="${v}" ${s[name]===v?'selected':''}>${l}</option>`).join('')}</select></label>`;
 const range=(name,label,min,max,unit)=>`<label>${label} <output for="bubble-${name}">${s[name]}${unit}</output><input id="bubble-${name}" type="range" name="${name}" min="${min}" max="${max}" value="${s[name]}" data-unit="${unit}"></label>`;
 return `<section class="card"><h2>灵感气泡</h2><p class="hint">让记下的灵感缓缓飘过页面。即时预览并保存在本设备，关闭后仍保留灵感记录。</p><div class="bubble-preview" aria-hidden="true"><div class="bubble-sample"><span></span></div></div><div class="row wrap"><button type="button" class="quiet" data-bubble-preset="quiet">安静背景</button><button type="button" class="quiet" data-bubble-preset="float">轻盈悬浮</button></div><form id="bubble-settings"><label><input type="checkbox" name="enabled" ${s.enabled?'checked':''}> 显示灵感气泡</label><label><input type="checkbox" name="threeD" ${s.threeD?'checked':''}> 启用 3D 质感</label><label><input type="checkbox" name="autoFade" ${s.autoFade?'checked':''}> 专注时自动淡出</label><p class="hint">开启后，输入文字或停留在 AI 时间管家页面时淡出；离开后恢复。可在灵感编辑窗口选择是否参与气泡展示。</p><div class="form-grid">${select('material','气泡材质',[['solid','纯色'],['frosted','磨砂'],['glass','玻璃'],['acrylic','亚克力'],['mica','云母'],['paper','纸感']])}${range('depth','3D 强度',0,100,'%')}${select('placement','气泡显示层级',[['background','页面背景'],['foreground','浮于页面之上']])}${select('direction','浮动方向',[['left','从右向左'],['right','从左向右'],['up','从下向上'],['down','从上向下']])}${range('speed','浮动速度',25,200,'%')}${range('density','同时显示数量',1,6,'个')}${range('size','气泡大小',60,160,'%')}<label>气泡颜色<input type="color" name="color" value="${s.color}"></label>${range('opacity','气泡不透明度',0,100,'%')}${range('fontSize','气泡字体大小',12,32,'px')}<label>气泡字体颜色<input type="color" name="fontColor" value="${s.fontColor}"></label>${range('fontOpacity','字体不透明度',0,100,'%')}</div><p class="hint">速度 100% 为舒缓默认速度，数值越大越快。手机最多同时显示 3 个，所有灵感轮流出现。浮于页面之上也不会拦截点击。0% 为完全透明，100% 为完全不透明。关闭轻量动画或启用系统减少动态效果时，气泡静止展示。</p><button type="button" class="text-btn" id="bubble-reset">恢复默认气泡</button></form></section>`;
}
export function setupBubbleSettings(){
 const form=document.querySelector('#bubble-settings');apply();
 form.onsubmit=e=>e.preventDefault();
 form.oninput=()=>{settings=clean({...settings,...Object.fromEntries(new FormData(form)),enabled:form.elements.enabled.checked,threeD:form.elements.threeD.checked,autoFade:form.elements.autoFade.checked});localStorage.setItem(key,JSON.stringify(settings));for(const input of form.querySelectorAll('input[type=range]'))input.previousElementSibling.value=settings[input.name]+input.dataset.unit;syncIdeaBubbles(allIdeas);};
 for(const button of form.closest('section').querySelectorAll('[data-bubble-preset]'))button.onclick=()=>{settings=clean({...settings,...(button.dataset.bubblePreset==='quiet'?{placement:'background',opacity:18,fontOpacity:40,speed:65,density:3,size:90}:{placement:'foreground',opacity:25,fontOpacity:65,speed:85,density:4,size:100})});localStorage.setItem(key,JSON.stringify(settings));form.closest('section').outerHTML=bubbleSettingsCard();setupBubbleSettings();syncIdeaBubbles(allIdeas);};
 document.querySelector('#bubble-reset').onclick=()=>{settings={...defaults,excluded:settings.excluded};localStorage.setItem(key,JSON.stringify(settings));form.closest('section').outerHTML=bubbleSettingsCard();setupBubbleSettings();syncIdeaBubbles(allIdeas);};
}
document.addEventListener('visibilitychange',()=>{if(layer)layer.classList.toggle('paused',document.hidden);});
window.addEventListener('storage',e=>{if(e.key===key){settings=read();syncIdeaBubbles(allIdeas);const form=document.querySelector('#bubble-settings');if(form){form.closest('section').outerHTML=bubbleSettingsCard();setupBubbleSettings();}}});

matchMedia('(max-width:620px)').addEventListener('change',()=>syncIdeaBubbles(allIdeas));

export const ideaInBubbles=id=>!settings.excluded.includes(id);
export function setIdeaInBubbles(id,enabled){settings.excluded=settings.excluded.filter(x=>x!==id);if(!enabled)settings.excluded.push(id);localStorage.setItem(key,JSON.stringify(settings));syncIdeaBubbles(allIdeas);}
function updateFocus(){const active=document.activeElement;const typing=active?.matches('textarea,input:not([type=checkbox]):not([type=range]):not([type=color]),[contenteditable=true]')&&!active.closest('#bubble-settings');layer?.classList.toggle('focus-faded',settings.autoFade&&(typing||location.hash==='#assistant'));}
document.addEventListener('focusin',updateFocus);document.addEventListener('focusout',()=>queueMicrotask(updateFocus));window.addEventListener('hashchange',updateFocus);
