'use strict';
const fs=require('node:fs'),path=require('node:path');
const acorn=require('internal/deps/acorn/acorn/dist/acorn');
// V16-B [Diubah oleh Gemini - 2026-11-21] Sertakan panel Alur V16 (office_flow_ui.js) dalam audit literal.
const files=['office_flow_ui.js','office_setup_ui.js','office_short_ui.js','specialist_wing.js','office_specialists.js','office_layout.js','office.js','furniture.js','chars.js','office_panels.js','office_settings.js','office_settings_ui.js'];
function literals(file){const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest',locations:true}),out=[];
 function walk(n,parent){if(!n||typeof n!=='object')return;if(n.type==='Literal'&&typeof n.value==='string')out.push({file,value:n.value,start:n.start,end:n.end,line:n.loc.start.line,parent:parent?.type,propertyKey:parent?.type==='Property'&&parent.key===n,source:source.slice(Math.max(0,n.start-45),Math.min(source.length,n.end+20))});for(const[k,v]of Object.entries(n))if(k!=='loc'){if(Array.isArray(v))v.forEach(c=>walk(c,n));else if(v&&typeof v==='object')walk(v,n);}}walk(ast);return out;}
if(require.main===module){const all=files.flatMap(literals);fs.writeFileSync(path.join(__dirname,'v6i_literals.json'),JSON.stringify(all,null,2));console.log(all.length+' literals');}
module.exports={files,literals};
