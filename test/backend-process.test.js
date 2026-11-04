import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BackendProcess} from '../lib/backend-process.js';
import {saveProviderSettings} from '../lib/provider-settings.js';
test('settings reach a private child process, then confirmed stop closes the controller',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'science-backend-'));
 const backend=new BackendProcess(process.execPath,{args:[fileURLToPath(new URL('../fixtures/fake-backend.mjs',import.meta.url)),'--expect-cache'],directory,runtimePath:'/fixture/science',timeoutMs:5000});
 try {
  await saveProviderSettings({baseUrl:'https://example.com',model:'fake-model',key:'fixture-secret'},directory);
  const result=await backend.start();assert.equal(result.status,'started');assert.ok(result.science_port>0);
  assert.equal(JSON.stringify(result).includes('fixture-secret'),false);
  await backend.stop();assert.equal(backend.child,null);
 }finally{await backend.stop();await rm(directory,{recursive:true,force:true});}
});

test('cleanup waits for acknowledgement and preserves the controller when stop fails',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'science-backend-stop-'));
 const backend=new BackendProcess(process.execPath,{args:[fileURLToPath(new URL('../fixtures/fake-backend.mjs',import.meta.url)),'--delay-stop','--fail-stop'],directory,timeoutMs:5000});
 try{
  await saveProviderSettings({baseUrl:'https://example.com',model:'fake-model',key:'fixture-secret'},directory);
  await backend.start();
  const child=backend.child;
  const failure=assert.rejects(backend.stop(),/cleanup not confirmed/);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(backend.child,child);assert.equal(child.exitCode,null);
  await failure;
  assert.equal(backend.child,child);assert.equal(child.exitCode,null);
  await backend.stop();assert.equal(backend.child,null);
 }finally{await backend.stop();await rm(directory,{recursive:true,force:true});}
});
