'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),schema=require('./office_settings');
module.exports=async function settingsStore(dataDir){
 const file=path.join(dataDir,'settings.json');let value=schema.defaults();
 try{const s=await fs.lstat(file);if(s.isFile()&&!s.isSymbolicLink()&&s.size<=32768)value=schema.validate(JSON.parse(await fs.readFile(file,'utf8')));}catch{/* Rusak/hilang: bawaan aman, tanpa mengganggu state fase 2. */}
 return {get:()=>schema.validate(value),async put(input){let next;try{next=schema.validate(input);}catch(e){e.status=400;throw e;}const temp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx'});await fs.rename(temp,file);value=next;return this.get();}finally{await fs.unlink(temp).catch(()=>{});}}};
};
