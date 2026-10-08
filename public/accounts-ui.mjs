const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {APP_VERSION} from './version.mjs';
export function avatarMarkup(settings){return settings.profile?.avatar?`<img src="${esc(settings.profile.avatar)}" alt="个人头像">`:esc(settings.name.slice(0,1));}
export function accountCard(account,settings){
 const p=settings.profile||{};
 return `<section class="card"><h2>${account?'我的账户':'我的资料'}</h2><div class="account-identity"><span class="account-avatar">${avatarMarkup(settings)}</span><div><strong>${esc(settings.name)}</strong><p class="hint">${account?`用户名：${esc(account.username)} · ${account.owner?'服务器管理员':'个人账户'}`:'本地离线空间'}${p.school||p.major?`<br>${esc([p.school,p.major].filter(Boolean).join(' · '))}`:''}</p></div></div>${p.bio?`<p class="account-bio">${esc(p.bio)}</p>`:''}<p class="hint">${account?(account.remember?'本设备已开启自动登录，有效期最长 30 天。':'本次为临时登录，最长 8 小时。'):'个人资料随本地数据保存。'}</p><div class="row wrap"><button id="edit-profile" class="quiet">编辑个人资料</button>${account?'<button id="account-logout" class="quiet">退出此账户</button>':''}${account?.owner?'<button id="manage-registration" class="quiet">注册与邀请设置</button>':''}</div></section>`;
}
export function versionCard(){return `<section class="card"><h2>版本与更新</h2><p>当前页面版本 <strong>${APP_VERSION}</strong><span id="desktop-version"></span></p><p id="update-status" class="hint">检查 GitHub 上发布的新版安装程序。更新不会自动下载安装。</p><button id="check-updates" class="quiet">检查更新</button><div id="update-links" class="row wrap"></div></section>`;}
export function setupAccountExtras({settings,change,post,openModal,closeModal,formHandler,toast}){
 const desktop=document.querySelector('#desktop-version');if(desktop&&document.documentElement.dataset.desktopVersion)desktop.textContent=` · 桌面窗口 ${document.documentElement.dataset.desktopVersion}`;
 document.querySelector('#check-updates').onclick=async()=>{
  const button=document.querySelector('#check-updates'),status=document.querySelector('#update-status'),links=document.querySelector('#update-links');button.disabled=true;status.textContent='正在检查…';links.replaceChildren();
  try{const response=await fetch('/api/updates',{signal:AbortSignal.timeout(25000)}),r=await response.json();if(!response.ok)throw Error(r.error||'无法获取更新信息');status.textContent=r.kind==='source'?`源码最新版本 ${r.latest}；目前没有发布可下载的安装包。`:(r.available?`发现版本 ${r.latest}，下载后运行安装程序升级。`:`发布版本 ${r.latest}，当前无需更新。`);if(r.available||r.kind==='source'){const a=document.createElement('a');a.href=r.installer||r.url;a.target='_blank';a.rel='noopener';a.textContent=r.installer?'下载新版安装程序':'打开项目页面';links.append(a);}}catch(e){status.textContent=`检查失败：${e.message}`;}finally{button.disabled=false;}
 };
 document.querySelector('#edit-profile').onclick=()=>{
  const p=settings.profile||{};let avatar=p.avatar||'';
  openModal('编辑个人资料',`<form id="profile-form"><div class="account-identity"><span class="account-avatar" id="profile-avatar-preview">${avatarMarkup(settings)}</span><label>头像<input id="profile-avatar-file" type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" id="remove-avatar" class="text-btn">移除头像</button></div><div class="form-grid"><label>昵称<input name="name" value="${esc(settings.name)}" maxlength="30" required></label><label>学校<input name="school" value="${esc(p.school)}" maxlength="60"></label><label>专业 / 方向<input name="major" value="${esc(p.major)}" maxlength="60"></label><label class="full">个人简介<textarea name="bio" maxlength="300" rows="3">${esc(p.bio)}</textarea></label></div><p class="hint">昵称显示在首页和侧栏。头像会压缩保存；用户名与登录密码不受影响。</p><div class="form-actions"><button class="primary">保存个人资料</button></div></form>`,()=>{
   const preview=document.querySelector('#profile-avatar-preview');
   document.querySelector('#remove-avatar').onclick=()=>{avatar='';preview.textContent=settings.name.slice(0,1);};
   document.querySelector('#profile-avatar-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const submit=document.querySelector('#profile-form button.primary');submit.disabled=true;let bitmap;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片');bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const size=Math.min(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);avatar=canvas.toDataURL('image/jpeg',0.85);const img=document.createElement('img');img.src=avatar;img.alt='头像预览';preview.replaceChildren(img);}catch(error){toast(error.message);}finally{bitmap?.close();submit.disabled=false;}};
   formHandler('#profile-form',async f=>{await change(s=>{s.settings.name=String(f.get('name')).trim();s.settings.profile={school:String(f.get('school')).trim(),major:String(f.get('major')).trim(),bio:String(f.get('bio')).trim(),avatar};});closeModal();toast('个人资料已保存');});
  });
 };
}
export function setupRegistration({api,post,openModal,formHandler,toast,logout}){
  const exit=document.querySelector('#account-logout');if(exit)exit.onclick=logout;
  const button=document.querySelector('#manage-registration');if(!button)return;
  button.onclick=async()=>{try{
    const policy=await api('/api/registration');
    openModal('注册与邀请',`<form id="registration-settings"><p class="hint">目前有 ${policy.accounts} 个账户。更换邀请码不会影响已经注册的账户。</p><label>注册方式<select name="mode">${[['invite','凭邀请码注册'],['closed','关闭注册'],['open','允许任何人注册']].map(([v,n])=>`<option value="${v}" ${policy.mode===v?'selected':''}>${n}</option>`).join('')}</select></label><label>邀请码<input value="${esc(policy.code)}" readonly></label><p class="hint">把服务器网址和邀请码发给朋友，他们就能在登录页创建自己的账户。</p><label class="account-check"><input type="checkbox" name="rotate">生成新的邀请码</label><div class="form-actions"><button class="primary">保存注册设置</button></div></form>`,()=>formHandler('#registration-settings',async f=>{
      const next=await post('/api/registration',{mode:f.get('mode'),rotate:f.get('rotate')==='on'});
      document.querySelector('#registration-settings input[readonly]').value=next.code;
      document.querySelector('#registration-settings [name=rotate]').checked=false;toast('注册设置已保存');
    }));
  }catch(e){toast(e.message);}};
}
export function setupAccountLogin({api,post,openModal,closeModal,formHandler,onLogin,toast}){
  const login=document.querySelector('#login-form'),remember=login.querySelector('[name=remember]');
  remember.checked=localStorage.getItem('shixu-remember-login')==='true';
  formHandler('#login-form',async f=>{try{
    const auto=f.get('remember')==='on';
    await post('/api/login',{username:f.get('username'),password:f.get('password'),remember:auto});
    localStorage.setItem('shixu-remember-login',String(auto));
    document.querySelector('#login-error').textContent='';login.querySelector('[name=password]').value='';await onLogin();
  }catch(e){document.querySelector('#login-error').textContent=e.message;}});
  document.querySelector('#login-register').onclick=async()=>{try{
    const {registration}=await api('/api/auth/options');
    if(registration==='closed'){toast('此服务器尚未开放注册，请联系管理员');return;}
    openModal('创建个人账户',`<form id="register-form"><p class="hint">注册后拥有独立空间，AI 接口需要自行配置。</p><label>用户名<input name="username" autocomplete="username" pattern="[a-zA-Z0-9_\\-]{3,32}" minlength="3" maxlength="32" required placeholder="3–32 位英文字母、数字、下划线或短横线"></label><label>密码<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>再次输入密码<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>${registration==='invite'?'<label>邀请码<input name="code" autocomplete="off" required></label>':''}<label class="account-check"><input type="checkbox" name="remember">自动登录（30 天）</label><div class="form-actions"><button class="primary">注册并进入我的空间</button></div></form>`,()=>formHandler('#register-form',async f=>{
      if(f.get('password')!==f.get('confirmation'))throw Error('两次输入的密码不一致');
      const credentials={username:f.get('username'),password:f.get('password')};
      await post('/api/register',{...credentials,code:f.get('code')});
      login.querySelector('[name=username]').value=credentials.username;
      try{await post('/api/login',{...credentials,remember:f.get('remember')==='on'});}catch{throw Error('账户已创建，请关闭此窗口，在登录页登录');}
      closeModal();await onLogin();toast('个人账户已创建');
    }));
  }catch(e){toast(e.message);}};
}
