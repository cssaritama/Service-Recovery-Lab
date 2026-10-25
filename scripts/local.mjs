import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import './wrangler-env.mjs';
const node=process.execPath;
function run(args){const p=spawnSync(node,args,{stdio:'inherit',env:process.env});if(p.status!==0)process.exit(p.status||1);}
if(!existsSync('dist/server/wrangler.json'))run(['node_modules/vinext/dist/cli.js','build']);
const test=process.argv.includes('--test');
const source=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
source.vars={...source.vars,...Object.fromEntries(['OLLAMA_URL','OLLAMA_MODEL','BUILD_REVISION'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]))};
source.d1_databases=source.d1_databases.map(binding=>({...binding,migrations_dir:resolve('drizzle'),migrations_table:'srl_migrations'}));
const config=resolve('dist/server/wrangler.local.json');writeFileSync(config,JSON.stringify(source,null,2));
const state=process.env.SRL_STATE_DIR||resolve(test?'.wrangler/test-state':'.wrangler/state');mkdirSync(state,{recursive:true});
const base=['--import','./scripts/wrangler-env.mjs','node_modules/wrangler/bin/wrangler.js'];
run([...base,'d1','migrations','apply','DB','--local','--config',config,'--persist-to',state]);
const args=[...base,'dev','--config',config,'--local','--persist-to',state,'--ip',process.env.SRL_HOST||'127.0.0.1','--port',process.env.PORT||(test?'4317':'3000'),'--inspector-port','0'];
const child=spawn(node,args,{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
