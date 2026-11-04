import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,symlink,rm,realpath,chmod,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {discoverScienceRuntime} from '../lib/runtime-discovery.js';

test('reuses a verified CSSwitch snapshot and rejects altered or linked files',{skip:process.platform==='win32'?'macOS runtime signature and permission checks are platform-specific':false},async()=>{
 const root=await mkdtemp(join(tmpdir(),'science-cache-test-'));
 try{
  const bytes='fixture runtime',digest=createHash('sha256').update(bytes).digest('hex'),file=join(root,'claude-science-'+digest);
  await writeFile(file,bytes,{mode:0o500});
  const managedRoot=join(root,'managed');
  const opts={app:join(root,'missing'),roots:[root],managedRoot,verify:async()=>true};
  const copied=await discoverScienceRuntime(opts);
  assert.equal(copied,await realpath(join(managedRoot,'runtime-snapshots','science','claude-science-'+digest)));
  assert.equal(await readFile(copied,'utf8'),bytes);
  assert.equal(await readFile(file,'utf8'),bytes);
  await chmod(file,0o700);await writeFile(file,'changed');await assert.rejects(discoverScienceRuntime(opts),/没有找到/);
  const link=join(root,'claude-science-'+createHash('sha256').update('changed').digest('hex'));await symlink(file,link);
  await assert.rejects(discoverScienceRuntime(opts),/没有找到/);
  await writeFile(file,bytes);await assert.rejects(discoverScienceRuntime({...opts,verify:async()=>false}),/没有找到/);
 }finally{await rm(root,{recursive:true,force:true});}
});
