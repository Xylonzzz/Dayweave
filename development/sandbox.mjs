import {runProgram,dockerExecutable,dockerEnvironment,inspectEnvironment} from './environment.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const command=(args,options)=>{const executable=dockerExecutable();return runProgram(executable,args,{...options,env:dockerEnvironment(executable)});};
export const doctor=()=>inspectEnvironment();
export async function buildSandbox(work,home,signal){
 const context=path.join(home,'image');fs.mkdirSync(context);
 for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(work.original,name),path.join(context,name));
 fs.writeFileSync(path.join(context,'Dockerfile'),'FROM node:24-bookworm-slim\nWORKDIR /deps\nCOPY package*.json ./\nRUN npm ci --ignore-scripts --no-audit --no-fund\nUSER 1000:1000\n');
 const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(context,'package-lock.json'))).digest('hex').slice(0,16),image=`shixu-development:${hash}`;
 const built=await command(['build','-t',image,context],{signal,timeout:600000});if(!built.ok)throw Error('测试环境构建失败：'+built.output);return image;
}
export async function testSandbox(work,image,home,signal){
 const name='shixu-check-'+crypto.randomUUID();
 // The candidate is read-only. Tests run in disposable tmpfs with no model keys or network.
 // Original tests are restored for a second pass, so deleting tests cannot earn a pass.
 const script=`set -eu
cp -R /candidate /work/run
ln -s /deps/node_modules /work/run/node_modules
cd /work/run
if [ "$1" = baseline ]; then
 rm -rf /work/run/tests
 cp -R /original/tests /work/run/tests
fi
find . -type f \\( -name '*.js' -o -name '*.mjs' \\) -not -path './node_modules/*' | while IFS= read -r file; do node --check "$file" || exit 1; done
node --test tests/*.test.mjs
`;
 const runner=path.join(home,'verify.sh');fs.writeFileSync(runner,script);
 const pass=mode=>command(['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','1536m','--cpus','2','--tmpfs','/tmp:rw,size=128m','--tmpfs','/work:rw,uid=1000,gid=1000,size=256m','--mount',`type=bind,src=${work.candidate},dst=/candidate,readonly`,'--mount',`type=bind,src=${work.original},dst=/original,readonly`,'--mount',`type=bind,src=${runner},dst=/verify.sh,readonly`,image,'sh','/verify.sh',mode],{signal,timeout:240000});
 try{const candidate=await pass('candidate');if(!candidate.ok)return candidate;const baseline=await pass('baseline');return {...baseline,output:'候选测试：\n'+candidate.output+'\n原始回归：\n'+baseline.output};}
 finally{await command(['rm','-f',name],{timeout:15000}).catch(()=>{});}
}
