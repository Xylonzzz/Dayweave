const repository='https://github.com/Xylonzzz/Dayweave';
export function newerVersion(candidate,current){
 const parse=s=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(s||'')?.slice(1).map(Number);
 const a=parse(candidate),b=parse(current);if(!a||!b)return false;
 for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;
}
export async function checkUpdates(current,request=fetch){
 const headers={Accept:'application/vnd.github+json','User-Agent':'Dayweave-update-check'};
 const response=await request('https://api.github.com/repos/Xylonzzz/Dayweave/releases/latest',{headers,signal:AbortSignal.timeout(10000)});
 if(response.status===404){
  const source=await request('https://raw.githubusercontent.com/Xylonzzz/Dayweave/main/package.json',{signal:AbortSignal.timeout(10000)});
  if(!source.ok)throw Error('无法读取更新信息，请稍后重试');
  const pkg=await source.json();return {current,latest:pkg.version,available:newerVersion(pkg.version,current),kind:'source',url:repository,installer:null};
 }
 if(!response.ok)throw Error(response.status===403||response.status===429?'更新服务请求过多，请稍后重试':'无法连接更新服务，请稍后重试');
 const release=await response.json();const installer=release.assets?.find(a=>/^Shixu-Setup-[\d.]+\.exe$/.test(a.name));
 const trusted=url=>typeof url==='string'&&url.startsWith(repository+'/');
 return {current,latest:String(release.tag_name||'').replace(/^v/,''),available:newerVersion(release.tag_name,current),kind:'release',url:trusted(release.html_url)?release.html_url:repository+'/releases',installer:trusted(installer?.browser_download_url)?installer.browser_download_url:null};
}
