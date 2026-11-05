import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';import {once} from 'node:events';
import {WindowsBackendRuntime} from '../lib/windows-backend-runtime.js';
import {acquireWindowsOwner,windowsScienceEnvironment} from '../lib/windows-owner.js';

test('simultaneous stale recovery cannot stop a new owner',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dsh-owner-race-'));
 const old=spawn(process.execPath,['-e','']);await once(old,'exit');
 await writeFile(join(root,'windows-owner.lock'),String(old.pid));
 let enter,release,stops=0;const entered=new Promise(ok=>enter=ok),paused=new Promise(ok=>release=ok);
 const first=new WindowsBackendRuntime({root,sandboxResolver:async()=>{enter();await paused;return {dataDir:root}},command:async()=>{stops++}});
 const second=new WindowsBackendRuntime({root,sandboxResolver:async()=>({dataDir:root}),command:async()=>{stops++}});
 try{
  const starting=first.acquireOwnership('fixture');await entered;
  await assert.rejects(second.acquireOwnership('fixture'),/已被占用/);
  assert.equal(stops,0);release();await starting;assert.equal(stops,1);
 }finally{release();await first.cleanup();await second.cleanup();await rm(root,{recursive:true,force:true});}
});
test('Science environment preserves Windows paths without inherited credentials',()=>{
 const env=windowsScienceEnvironment('http://127.0.0.1:12345/managed',{systemroot:'fixture-system',UserProfile:'fixture-user',LocalAppData:'fixture-appdata',Path:'fixture-path',OPENAI_API_KEY:'fake-openai-secret',AWS_SECRET_ACCESS_KEY:'fake-cloud-secret',ANTHROPIC_AUTH_TOKEN:'fake-anthropic-secret',ANTHROPIC_BASE_URL:'https://unrelated.example',CLAUDE_CODE_SUBAGENT_MODEL:'unrelated-model'});
 assert.equal(env.SystemRoot,'fixture-system');assert.equal(env.USERPROFILE,'fixture-user');assert.equal(env.LOCALAPPDATA,'fixture-appdata');assert.equal(env.PATH,'fixture-path');
 assert.equal(env.ANTHROPIC_BASE_URL,'http://127.0.0.1:12345/managed');assert.equal(JSON.stringify(env).includes('secret'),false);assert.equal('CLAUDE_CODE_SUBAGENT_MODEL' in env,false);
});
test('Windows OS releases ownership after the controller dies',{skip:process.platform!=='win32'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'dsh-owner-crash-'));
 const module=new URL('../lib/windows-owner.js',import.meta.url).href;
 const code=`import {acquireWindowsOwner} from ${JSON.stringify(module)};await acquireWindowsOwner(${JSON.stringify(root)});console.log('locked');setInterval(()=>{},1000)`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','ignore'],windowsHide:true});
 try{await once(child.stdout,'data');const exited=once(child,'exit');child.kill();await exited;const release=await acquireWindowsOwner(root);await release();}
 finally{if(child.exitCode===null&&child.signalCode===null)child.kill();await rm(root,{recursive:true,force:true});}
});
