const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accountCard(account){
  if(!account)return '';
  return `<section class="card"><h2>我的账户</h2><p>用户名：${esc(account.username)} · ${account.owner?'服务器管理员':'个人账户'}</p><p class="hint">课程、任务、灵感、对话和 AI 接口分别保存在你的账户中。${account.remember?'本设备已开启自动登录，有效期最长 30 天。':'本次为临时登录，最长 8 小时。'}</p><div class="row wrap"><button id="account-logout" class="quiet">退出此账户</button>${account.owner?'<button id="manage-registration" class="quiet">注册与邀请设置</button>':''}</div></section>`;
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
