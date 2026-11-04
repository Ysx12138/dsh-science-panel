import test from 'node:test';
import assert from 'node:assert/strict';
import {BackendRuntime} from '../lib/backend-runtime.js';
test('backend uses only a confirmed managed receipt and cleans up on failure',async()=>{
 let stops=0;const process={async start(){return {science_port:12345}},async stop(){stops++}};
 const ok=new BackendRuntime({binaryResolver:async()=>'/fake',processFactory:()=>process,configResolver:async port=>({port,cli:'/isolated/bin',dataDir:'/isolated/data'})});
 assert.deepEqual(await ok.start(),{port:12345});assert.equal(ok.config.dataDir,'/isolated/data');await ok.stop();assert.equal(stops,1);
 const bad=new BackendRuntime({binaryResolver:async()=>'/fake',processFactory:()=>process,configResolver:async()=>{throw new Error('untrusted receipt')}});
 await assert.rejects(bad.start(),/untrusted receipt/);assert.equal(bad.config,null);assert.equal(stops,2);
});

test('managed receipt cannot escape the isolated directory',async()=>{
 const {backendManagedConfig}=await import('../lib/backend-runtime.js');
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');
 const {join}=await import('node:path');const {tmpdir}=await import('node:os');
 const root=await mkdtemp(join(tmpdir(),'science-receipt-'));
 try{
  const data=join(root,'data'),cli=join(root,'science');await mkdir(data);await writeFile(cli,'fake');
  const receipt=join(root,'science-managed-launch.v1.json');
  await writeFile(receipt,JSON.stringify({port:12345,data_dir:data,runtime_path:cli}));
  const result=await backendManagedConfig(12345,root);assert.equal(result.port,12345);
  await assert.rejects(backendManagedConfig(12346,root));
  await writeFile(receipt,JSON.stringify({port:12345,data_dir:'/tmp',runtime_path:cli}));
  await assert.rejects(backendManagedConfig(12345,root));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('failed stop retains runtime ownership so cleanup can be retried',async()=>{
 let fail=true;
 const process={async start(){return {science_port:12345}},async stop(){if(fail)throw new Error('cleanup pending')}};
 const runtime=new BackendRuntime({binaryResolver:async()=>'/fake',processFactory:()=>process,configResolver:async port=>({port,cli:'/isolated/bin',dataDir:'/isolated/data'})});
 await runtime.start();
 await assert.rejects(runtime.stop(),/cleanup pending/);
 assert.equal(runtime.process,process);assert.equal(runtime.config.port,12345);
 fail=false;await runtime.stop();assert.equal(runtime.process,null);assert.equal(runtime.config,null);
});
