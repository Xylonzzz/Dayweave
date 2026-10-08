import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

// Report only paths and rule names, never the sensitive value itself.
export function inspectPublicFile(name, buffer) {
  const issues=[];
  if (/(^|\/)(data|test-output|dist|\.shixu-tools|\.shixu-development|\.shixu-releases)(\/|$)/.test(name)
    || (/(^|\/)\.env($|\.)/.test(name)&&!name.endsWith('.example'))
    || /\.(sqlite|sqlite3|db|log|pem|pfx|p12)$/.test(name)) issues.push('private-file');
  // Git batch slices may start at odd offsets; decode UTF16 from an aligned copy.
  const aligned=Buffer.from(buffer);
  const text=aligned.toString('utf8')+'\n'+aligned.toString('utf16le');
  if (/\bsk-[a-zA-Z0-9_-]{24,}\b/.test(text)) issues.push('possible-api-key');
  if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)) issues.push('private-key');
  if (/[A-Z]:[\\/]Users[\\/][^\s\\/<>]+/i.test(text)
    || /\/(?:home|Users)\/(?!example\b|user\b)[a-zA-Z0-9_.-]+\//.test(text)) issues.push('personal-home-path');
  if (name==='README.md'||name.startsWith('docs/')) {
    for (const ip of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
      const a=ip[0].split('.').map(Number);
      if(a.some(n=>n>255)) continue;
      const safe=ip[0]==='0.0.0.0'||a[0]===127
        || (a[0]===192&&a[1]===0&&a[2]===2)
        || (a[0]===198&&a[1]===51&&a[2]===100)
        || (a[0]===203&&a[1]===0&&a[2]===113);
      if(!safe) {issues.push('non-example-ip-in-docs');break;}
    }
  }
  return [...new Set(issues)];
}

function git(args,input) {
  const r=spawnSync('git',args,{input:input===undefined?undefined:Buffer.from(input),encoding:null,maxBuffer:128*1024*1024,windowsHide:true});
  if(r.status!==0)throw Error(`git ${args[0]} failed`);
  return r.stdout;
}

if(process.argv[1] && fs.realpathSync(process.argv[1])===fs.realpathSync(new URL(import.meta.url))) {
  const findings=[];
  const paths=git(['ls-files','-z']).toString().split('\0').filter(Boolean);
  for(const name of paths) if(fs.existsSync(name)) {
    for(const rule of inspectPublicFile(name,fs.readFileSync(name)))findings.push({scope:'working-tree',name,rule});
  }
  if(process.argv.includes('--history')) {
    // Only publishable branches, remotes and tags; exclude local app checkpoint refs.
    const objects=git(['rev-list','--objects','--branches','--remotes','--tags']).toString().trim().split('\n');
    const entries=objects.filter(line=>line.includes(' ')).map(line=>{
      const sep=line.indexOf(' ');return {oid:line.slice(0,sep),name:line.slice(sep+1)};
    });
    const batch=git(['cat-file','--batch'],entries.map(e=>e.oid).join('\n')+'\n');
    let offset=0;
    for(const {name} of entries) {
      const end=batch.indexOf(10,offset);
      const [,type,sizeText]=batch.subarray(offset,end).toString().split(' ');
      const size=Number(sizeText);
      if(end<0||!Number.isFinite(size))throw Error('Invalid Git object response');
      offset=end+1;
      if(type==='blob')for(const rule of inspectPublicFile(name,batch.subarray(offset,offset+size)))
        findings.push({scope:'reachable-history',name,rule});
      offset+=size+1;
    }
  }
  if(findings.length) {console.error(JSON.stringify(findings,null,2));process.exitCode=1;}
  else console.log('Public-file checks passed'+(process.argv.includes('--history')?' (working tree and reachable history).':'.'));
}
