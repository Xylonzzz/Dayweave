import fs from 'node:fs';
import path from 'node:path';
import {configureEnvironment} from './setup.mjs';
const root=path.resolve(process.argv[2]),harnessRoot=process.argv[3]||undefined;
const home=path.join(root,'.shixu-tools');fs.mkdirSync(home,{recursive:true});
const lock=path.join(home,'setup.lock');
try{if(Number(fs.readFileSync(lock,'utf8'))!==process.pid)process.exit(0);}catch{process.exit(0);}
const save=state=>{const file=path.join(home,'setup.json');fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2));fs.renameSync(file+'.tmp',file);};
try{await configureEnvironment({root,harnessRoot,save});}finally{fs.unlinkSync(lock);}
