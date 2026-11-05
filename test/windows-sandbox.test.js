import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {prepareWindowsSandbox} from '../lib/windows-sandbox.js';
test('sandbox preserves identity on restart and refuses corrupt state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'science-sandbox-'));
 try{
  const options={protect:async()=>{}};
  const first=await prepareWindowsSandbox(root,options);
  const identity=await readFile(join(first.home,'dsh-identity.json'),'utf8');
  assert.deepEqual(await prepareWindowsSandbox(root,options),first);
  assert.equal(await readFile(join(first.home,'dsh-identity.json'),'utf8'),identity);
  await writeFile(join(first.dataDir,'active-org.json'),'{}');
  await assert.rejects(prepareWindowsSandbox(root,options),/身份不一致/);
  assert.equal(await readFile(join(first.home,'dsh-identity.json'),'utf8'),identity);
 }finally{await rm(root,{recursive:true,force:true});}
});
