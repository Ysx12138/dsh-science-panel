import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createServer} from 'node:net';import {setTimeout as delay} from 'node:timers/promises';
import {createLocalLogin} from '../lib/windows-login.js';
import {verifyWindowsScience} from '../lib/windows-science-runtime.js';
import {secureWindowsPath} from '../lib/provider-settings.js';
import {WindowsBackendRuntime} from '../lib/windows-backend-runtime.js';
const exec=promisify(execFile);
async function port(){const s=createServer();await new Promise((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok)});const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
test('official Windows runtime starts with isolated local credentials',{skip:process.platform!=='win32'||!process.env.DSH_SCIENCE_PACKAGE,timeout:120000},async()=>{
 const binary=process.env.DSH_SCIENCE_PACKAGE;await verifyWindowsScience(binary);
 const root=await mkdtemp(join(tmpdir(),'dsh-science-live-'));await secureWindowsPath(root,true);
 const data=join(root,'.claude-science');await mkdir(data);await mkdir(join(data,'.oauth-tokens'));
 const login=createLocalLogin();
 await writeFile(join(data,'encryption.key'),login.keyFile);
 await writeFile(join(data,'active-org.json'),JSON.stringify({org_uuid:login.org}));
 await writeFile(join(data,'.oauth-tokens',login.account+'.enc'),login.encryptedToken);
 const listen=await port();let preview=await port();while(preview===listen)preview=await port();
 // Windows sandbox resolves Known Folders through the OS. Keep the OS profile
 // intact; Science's explicit --data-dir scopes this fixture's auth and state.
 const env={...process.env};
 const child=spawn(binary,['serve','--data-dir',data,'--host','127.0.0.1','--port',String(listen),'--sandbox-port',String(preview),'--no-browser','--no-auto-update'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let diagnostic='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-6000)});
 let failed;child.once('error',()=>{failed=true});
 try{
  let ready=false;
  for(let i=0;i<180;i++){
   if(failed||child.exitCode!==null||child.signalCode!==null)throw new Error('Windows Science exited before readiness: '+diagnostic.replace(/https?:\/\/[^\s]+/g,'[redacted-url]').replace(/sk-ant-[^\s]+/g,'[redacted-token]').slice(-2500));
   try{const res=await fetch(`http://127.0.0.1:${listen}/`,{signal:AbortSignal.timeout(300)});await res.arrayBuffer();if(res.status<500){ready=true;break;}}catch{}
   await delay(250);
  }
  assert.equal(ready,true,'Windows Science did not become ready');
  const {stdout}=await exec(binary,['url','--data-dir',data],{env,timeout:15000,windowsHide:true});
  const url=new URL(stdout.match(/http:\/\/[^\s]+/)?.[0]);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.equal(Number(url.port),listen);
 }finally{
  await exec(binary,['stop','--data-dir',data],{env,timeout:15000,windowsHide:true}).catch(()=>{});
  if(child.exitCode===null&&child.signalCode===null)child.kill();
  for(let i=0;i<40&&child.exitCode===null&&child.signalCode===null;i++)await delay(100);
  await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
});


test('Windows plugin controller starts, returns a login URL, stops, and restarts',{skip:process.platform!=='win32'||!process.env.DSH_SCIENCE_PACKAGE,timeout:240000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'dsh-win-controller-'));
 const controller=new WindowsBackendRuntime({root,installer:async()=>process.env.DSH_SCIENCE_PACKAGE,settingsResolver:async()=>({baseUrl:'http://127.0.0.1:9',model:'fixture-model',key:'fixture-key'})});
 try{
  for(let run=0;run<2;run++){
   const result=await controller.start();assert.ok(result.port>0);
   assert.equal(controller.config.port,result.port);
   const {stdout}=await exec(controller.config.cli,['url','--data-dir',controller.config.dataDir],{timeout:15000,windowsHide:true});
   const url=new URL(stdout.match(/http:\/\/[^\s]+/)?.[0]);
   assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.equal(Number(url.port),result.port);
   await controller.stop();assert.equal(controller.config,null);
  }
 }finally{await controller.stop();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
