export function normalizeColor(value){
 const text=String(value).trim().replace(/^0(?=#)/,'').replace(/^0x/i,'#');
 if(/^#?[0-9a-f]{6}$/i.test(text))return '#'+text.replace('#','').toUpperCase();
 if(/^#[0-9a-f]{3}$/i.test(text))return '#'+[...text.slice(1)].map(x=>x+x).join('').toUpperCase();
 const rgb=/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(text);
 if(rgb&&rgb.slice(1).every(x=>Number(x)<=255))return '#'+rgb.slice(1).map(x=>Number(x).toString(16).padStart(2,'0')).join('').toUpperCase();
 return null;
}
export function enhanceColors(root=document){
 for(const picker of root.querySelectorAll('input[type=color]:not([data-color-enhanced])')){
  picker.dataset.colorEnhanced='true';
  const label=picker.closest('label')?.childNodes[0]?.textContent?.trim()||'颜色';
  const group=document.createElement('span');group.className='color-control';picker.before(group);group.append(picker);
  const code=document.createElement('input');code.type='text';code.className='color-code';code.value=picker.value.toUpperCase();code.placeholder='#FFFFFF';code.spellcheck=false;code.maxLength=24;code.setAttribute('aria-label',label+'（颜色代码）');code.title='支持 #FFFFFF、#FFF 或 rgb(255,255,255)';group.append(code);
  let fromText=false;
  picker.addEventListener('input',()=>{if(!fromText)code.value=picker.value.toUpperCase();code.setCustomValidity('');code.removeAttribute('aria-invalid');});
  code.addEventListener('input',event=>{event.stopPropagation();const value=normalizeColor(code.value);code.setCustomValidity(value?'':'请输入 #RRGGBB 或 rgb(0,0,0) 格式的颜色');code.setAttribute('aria-invalid',String(!value));if(value){picker.value=value;fromText=true;picker.dispatchEvent(new Event('input',{bubbles:true}));fromText=false;}});
  code.addEventListener('blur',()=>{const value=normalizeColor(code.value);if(value)code.value=value;});
  code.addEventListener('change',event=>event.stopPropagation());
 }
}
if(typeof document!=='undefined'){
 const start=()=>{enhanceColors();new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))enhanceColors();}).observe(document.body,{childList:true,subtree:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
