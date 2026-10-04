import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function backupLocal(dataDir){
 if(process.env.DB_DRIVER==='mysql')throw Error('MySQL 模式请使用 mysqldump 并备份 data/secret.key；backup:local 只备份 SQLite，详见 docs/WINDOWS_MYSQL.md');
 const {DatabaseSync,backup}=await import('node:sqlite');
 const source=path.resolve(dataDir),dbFile=path.join(source,'planner.sqlite'),key=path.join(source,'secret.key');
 if(!fs.existsSync(dbFile)||!fs.existsSync(key))throw Error('数据目录缺少数据库或加密密钥，未创建备份');
 const destination=path.join(source,'backups',new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(destination,{recursive:true,mode:0o700});const db=new DatabaseSync(dbFile,{readOnly:true});
 try{await backup(db,path.join(destination,'planner.sqlite'));fs.copyFileSync(key,path.join(destination,'secret.key'));fs.chmodSync(path.join(destination,'secret.key'),0o600);}finally{db.close();}
 const check=new DatabaseSync(path.join(destination,'planner.sqlite'),{readOnly:true});try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('备份完整性检查失败');}finally{check.close();}
 fs.writeFileSync(path.join(destination,'RESTORE.txt'),'此目录包含个人数据和解密密钥，请勿公开。\n恢复前停止时序，保留当前数据目录备份，再将本目录中的 planner.sqlite 与 secret.key 一起恢复到空的数据目录；不要与旧 WAL 文件混用。使用对应版本启动后核对数据。\n',{mode:0o600});return destination;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){await import('dotenv/config');console.log('完整数据备份已创建并通过数据库检查：'+await backupLocal(process.env.DATA_DIR||path.join(import.meta.dirname,'data')));}
