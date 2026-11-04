import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {installScience,scienceInstalled,parseSystemHttpsProxy} from '../lib/science-installer.js';

test('uses the configured HTTPS system proxy only when enabled and valid',()=>{
  assert.equal(parseSystemHttpsProxy('HTTPSEnable : 1\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 7897\n'),'http://127.0.0.1:7897');
  assert.equal(parseSystemHttpsProxy('HTTPSEnable : 0\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 7897\n'),null);
  assert.equal(parseSystemHttpsProxy('HTTPSEnable : 1\nHTTPSProxy : bad@host\nHTTPSPort : 7897\n'),null);
});

test('installer preserves existing apps and refuses conflicting files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'science-setup-test-'));
  try {
    const app=join(root,'Claude Science.app');
    await mkdir(join(app,'Contents/Resources/bin'),{recursive:true});
    await writeFile(join(app,'Contents/Resources/bin/claude-science'),'fixture',{mode:0o755});
    let downloads=0;
    const result=await installScience({destination:app,platform:'darwin',arch:'arm64',download:async()=>{downloads++}});
    assert.equal(result.alreadyInstalled,true);assert.equal(downloads,0);assert.equal(await scienceInstalled(app),true);
    const conflict=join(root,'conflict.app');await writeFile(conflict,'preserve me');
    await assert.rejects(installScience({destination:conflict,platform:'darwin',arch:'arm64'}),/同名/);
    await assert.rejects(installScience({destination:join(root,'other'),platform:'darwin',arch:'x64'}),/Apple Silicon/);
  }finally{await rm(root,{recursive:true,force:true});}
});
