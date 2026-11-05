import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installWindowsScience} from '../lib/windows-science-runtime.js';

test('Windows runtime refuses invalid downloads and preserves installed files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'science-win-runtime-'));
 const options={root,platform:'win32',arch:'x64',protect:async()=>{},verify:async file=>{if(await readFile(file,'utf8')!=='verified fixture')throw new Error('invalid signature')},download:async file=>writeFile(file,'verified fixture')};
 try{
  await assert.rejects(installWindowsScience({...options,download:async file=>writeFile(file,'tampered')}),/invalid signature/);
  assert.deepEqual(await readdir(join(root,'runtime-windows')),[]);
  const binary=await installWindowsScience(options);
  assert.equal(await readFile(binary,'utf8'),'verified fixture');
  assert.equal(await installWindowsScience({...options,download:async()=>{throw new Error('unexpected download')}}),binary);
  await writeFile(binary,'tampered existing');
  await assert.rejects(installWindowsScience(options),/invalid signature/);
  assert.equal(await readFile(binary,'utf8'),'tampered existing');
 }finally{await rm(root,{recursive:true,force:true});}
});
