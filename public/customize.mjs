const escape=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const phases={queued:'准备中',prepared:'副本已准备',environment:'准备测试环境',developing:'开发与修正',testing:'运行测试',reviewing:'独立审查',integrating:'正在整合',integrated:'已整合源码',ready:'候选版本已就绪',failed:'未完成',cancelled:'已取消',interrupted:'上次运行已中断',rolledBack:'已恢复源码'};
const finished=new Set(['integrated','ready','failed','cancelled','interrupted','rolledBack']);
export function customizeMarkup(providers,local){
 if(local)return '<section class="card"><h1>定制我的工具</h1><p>离线本地空间可以使用已有功能；开发需要连接运行时序的本机服务或已启用开发权限的服务器。</p><button class="quiet" data-page="settings">返回设置</button></section>';
 return `<section id="customize-panel"><div class="page-heading"><div><span class="eyebrow">MAKE IT YOUR OWN</span><h1>定制我的工具</h1><p>说出你想改变的地方，让 AI 开发、验证并审查。</p></div><button class="quiet" data-page="settings">返回设置</button></div><section class="card"><div class="section-head"><h2>开发环境</h2><button class="quiet" id="dev-check">重新检查</button></div><p id="dev-environment" role="status">正在检查 Harness 与 Docker…</p><div id="dev-environment-help"></div><div id="dev-setup"></div><p class="hint">需要运行中的 Docker Linux 容器及已配置的 Harness。仅本机访问默认开放；远程部署由管理员启用。缺少环境时不会调用模型。</p></section><section class="card"><h2>你希望怎样改进时序？</h2><form id="dev-form"><label>开发需求<textarea name="request" rows="5" maxlength="12000" required placeholder="例如：在今日概览增加本周专注时长，允许按课程筛选。请保留现有日程功能，并补充测试。"></textarea></label><div class="form-grid"><label>开发与审查使用的 API<select name="providerId" required>${providers.filter(p=>p.format==='openai').map(p=>`<option value="${escape(p.id)}">${escape(p.name)} · ${escape(p.model)}</option>`).join('')||'<option value="">请先在设置中添加兼容 API</option>'}</select></label><label>通过测试和审查后<select name="integration"><option value="auto">自动整合源码</option><option value="review">保留候选版本，稍后整合</option></select></label></div><p class="hint">必要源码会发送给所选 API，并消耗该接口额度。测试不使用你的真实日程或密钥。后端源码改动需重启服务后生效；当前不自动部署或迁移数据库。</p><button class="primary" id="dev-start" disabled>开始定制</button><span id="dev-message" role="status" class="hint"></span></form></section><div class="development-columns"><section class="card"><div class="section-head"><h2>定制记录</h2><button class="text-btn" id="dev-refresh">刷新</button></div><div id="dev-jobs">正在读取记录…</div></section><section class="card"><h2>执行详情</h2><div id="dev-detail" aria-live="polite">选择一条记录查看进度、审查和文件改动。</div></section></div></section>`;
}
export function setupCustomizer(api,toast){
 const panel=document.querySelector('#customize-panel');if(!panel)return;
 const $=s=>panel.querySelector(s);let selected='',busy=false,environment,detailKey='',polling=false;
 const request=(url,body)=>api('/api/development'+url,body===undefined?{}:{method:'POST',headers:{'X-Shixu-Development':'1'},body:JSON.stringify(body)});
 const startState=()=>{$('#dev-start').disabled=busy||environment?.setup?.phase==='running'||!environment?.available||!!environment?.activeId||!$('#dev-form').elements.providerId.value;};
 async function check(){
  $('#dev-check').disabled=true;
  try{environment=await request('/status');if(!panel.isConnected)return;$('#dev-environment').textContent=!environment.allowed?environment.reason:`Harness：${environment.harness.available?'已就绪':environment.harness.error}。Docker：${environment.docker.available?'已就绪':environment.docker.message}。`;$('#dev-environment-help').innerHTML=(environment.docker.steps?.length?`<ol class="dev-events">${environment.docker.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol>`:'')+(environment.docker.windows?`<details><summary>查看 WSL 检查结果</summary><pre class="dev-code">${escape(environment.docker.windows.wslStatus)}</pre></details>`:'');renderSetup();startState();await refresh();}
  catch(e){$('#dev-environment').textContent=e.message;}finally{$('#dev-check').disabled=false;}
 }
 function renderSetup(){
  const state=environment?.setup,host=$('#dev-setup');if(!state){host.innerHTML='';return;}
  if(!state.allowed||!state.supported){host.innerHTML='<p class="hint">一键配置需要在 Windows x64 电脑上本机打开时序。远程服务器请由管理员准备环境。</p>';return;}
  const running=state.phase==='running';
  host.innerHTML=`<div class="dev-setup-box"><h3>一键准备定制环境</h3><p role="status">${escape(state.message)}</p><details><summary>组件、下载与安装说明</summary><p>只为 AI 定制功能准备环境，日常使用时序无需安装。复用已有组件；缺少时准备 WSL、Docker Desktop、固定版本 Harness 和测试镜像。首次下载可能超过 1 GB，建议至少预留 8 GB 空间。</p><p>工具与日志位置：${escape(state.location)}。Docker 和 WSL 使用系统安装位置。网络下载支持缓存与重试；系统可能请求管理员授权和重启，不会自动重启。</p><p>Docker 首次启动需你确认其许可条款。配置不调用付费 AI；完成后在设置中添加自己的 API。<a href="https://docs.docker.com/desktop/setup/install/windows-install/" target="_blank" rel="noopener">Docker 官方安装说明</a></p></details>${running?'':`<label><input type="checkbox" id="dev-setup-consent"> 我已了解，允许下载并准备上述组件</label><button type="button" class="quiet" id="dev-setup-start">${state.phase==='idle'?'一键准备环境':state.phase==='ready'?'重新验收环境':'继续配置 / 重试'}</button>`}<details><summary>配置进度</summary><ol>${(state.events||[]).map(e=>`<li>${escape(e.message)}</li>`).join('')}</ol><p class="hint">刷新或关闭页面不会停止配置。重启后回到此页点击继续配置；已完成的组件会复用。</p></details><button type="button" class="text-btn" id="dev-setup-logs">查看配置日志</button><div id="dev-setup-log-output"></div></div>`;
  $('#dev-setup-logs').onclick=async()=>{try{const result=await request('/setup/log');if(panel.isConnected)$('#dev-setup-log-output').innerHTML=result.logs.length?result.logs.map(log=>`<details open><summary>${escape(log.name)}</summary><pre class="dev-code">${escape(log.text)}</pre></details>`).join(''):'暂时没有配置日志。';}catch(e){toast(e.message);}};
  const button=$('#dev-setup-start');if(button){button.disabled=true;$('#dev-setup-consent').onchange=e=>{button.disabled=!e.target.checked;};button.onclick=async()=>{button.disabled=true;try{const result=await request('/setup',{consent:true});environment.setup={...state,...result};renderSetup();startState();}catch(e){toast(e.message);button.disabled=false;}};}
 }
 async function refreshSetup(){
  if(!environment?.setup?.allowed||!environment.setup.supported)return;
  const previous=environment.setup,state=await request('/setup');if(!panel.isConnected)return;
  environment.setup=state;
  if(JSON.stringify(previous)!==JSON.stringify(state))renderSetup();
  startState();if(previous.phase==='running'&&state.phase!=='running')await check();
 }
 async function refresh(){
  if(!panel.isConnected||!environment?.allowed)return;
  const jobs=await request('/jobs');if(!panel.isConnected)return;
  const running=jobs.find(x=>!finished.has(x.phase));environment.activeId=running?.id||null;startState();
  $('#dev-jobs').innerHTML=jobs.length?jobs.map(job=>`<button type="button" class="dev-job ${job.id===selected?'selected':''}" data-job="${escape(job.id)}"><strong>${escape(job.request.slice(0,85))}</strong><small>${escape(phases[job.phase]||job.phase)} · ${escape(new Date(job.createdAt).toLocaleString('zh-CN'))}</small></button>`).join(''):'还没有定制记录。';
  if(!selected&&jobs.length)selected=running?.id||jobs[0].id;
  for(const button of panel.querySelectorAll('[data-job]'))button.onclick=()=>{selected=button.dataset.job;detailKey='';refresh().catch(e=>toast(e.message));};
  if(selected){const id=selected;const detail=await request('/jobs/'+id);if(panel.isConnected&&selected===id)renderDetail(detail);}
 }
 function renderDetail(job){
  const fingerprint=JSON.stringify(job);if(fingerprint===detailKey)return;detailKey=fingerprint;
  $('#dev-detail').innerHTML=`<p><strong>${escape(phases[job.phase]||job.phase)}</strong></p><p>${escape(job.progress||'')}</p><p class="hint">${escape(job.request)}</p><ol class="dev-events">${(job.events||[]).map(e=>`<li>${escape(e.message)}</li>`).join('')}</ol>${job.review?`<h3>AI 审查结论</h3><p>${escape(job.review.summary)}</p>`:''}<div class="row wrap">${!finished.has(job.phase)?'<button class="quiet" data-dev-action="cancel">停止本次开发</button>':''}${job.phase==='ready'?'<button class="primary" data-dev-action="apply">整合此候选版本</button>':''}${job.phase==='integrated'?'<button class="quiet" data-dev-action="rollback">恢复到本次修改前的源码</button><p class="hint">恢复会撤回本次源码改动；如有后续修改则阻止覆盖。后端需重启。</p>':''}</div>${job.changes?.length?`<h3>改动文件</h3><div class="dev-files">${job.changes.map(c=>`<button class="text-btn" data-dev-file="${escape(c.path)}">${escape(c.path)}</button>`).join('')}</div><div id="dev-file-preview"></div>`:''}${(job.logs||[]).map(log=>`<details><summary>${escape(log.name)} · 实际测试输出</summary><pre class="dev-code">${escape(log.text)}</pre></details>`).join('')}`;
  for(const button of panel.querySelectorAll('[data-dev-action]'))button.onclick=async()=>{button.disabled=true;try{await request(`/jobs/${job.id}/${button.dataset.devAction}`,{});detailKey='';await refresh();}catch(e){toast(e.message);}finally{if(button.isConnected)button.disabled=false;}};
  for(const button of panel.querySelectorAll('[data-dev-file]'))button.onclick=async()=>{try{const file=await request(`/jobs/${job.id}/file?path=${encodeURIComponent(button.dataset.devFile)}`);if(!panel.isConnected||selected!==job.id)return;$('#dev-file-preview').innerHTML=`<h3>${escape(file.path)}</h3><div class="dev-diff"><div><h4>修改前</h4><pre class="dev-code">${escape(file.before)}</pre></div><div><h4>修改后</h4><pre class="dev-code">${escape(file.after)}</pre></div></div>`;}catch(e){toast(e.message);}};
 }
 $('#dev-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;startState();try{const data=new FormData(e.target);const result=await request('/jobs',{request:data.get('request'),providerId:data.get('providerId'),autoApply:data.get('integration')==='auto'});selected=result.id;detailKey='';$('#dev-message').textContent='已开始。关闭页面后任务仍会继续。';await refresh();}catch(error){$('#dev-message').textContent=error.message;}finally{busy=false;startState();}};
 $('#dev-check').onclick=check;$('#dev-refresh').onclick=()=>refresh().catch(e=>toast(e.message));
 const poll=async()=>{if(!panel.isConnected)return;if(!document.hidden&&!polling){polling=true;try{await refreshSetup();await refresh();}catch{}finally{polling=false;}}if(panel.isConnected)setTimeout(poll,2500);};
 check().finally(()=>{if(panel.isConnected)setTimeout(poll,2500);});
}
