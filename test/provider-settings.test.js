import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,stat,symlink,writeFile } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readProviderSettings,saveProviderSettings} from '../lib/provider-settings.js';

test('settings are private, never returned to UI, and blank key preserves existing key',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'science-provider-test-'));
 try{
  await saveProviderSettings({baseUrl:'https://example.com',model:'test-model',key:'fixture-secret'},directory);
  if(process.platform!=='win32') assert.equal((await stat(join(directory,'provider.json'))).mode & 0o777,0o600);
  else {
   const script=`$acl=[System.IO.File]::GetAccessControl($env:DSH_ACL_TEST_FILE); $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])); if($rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid -or $rules[0].AccessControlType -ne 'Allow' -or (($rules[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl)) { exit 1 }`;
   execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,DSH_ACL_TEST_FILE:join(directory,'provider.json')},windowsHide:true});
  }
  const exposed=await readProviderSettings(directory);
  assert.equal(exposed.keyConfigured,true);assert.equal(exposed.active,false);
  assert.equal(JSON.stringify(exposed).includes('fixture-secret'),false);
  await saveProviderSettings({baseUrl:'https://example.com/v1',model:'next-model',key:''},directory);
  const stored=JSON.parse(await readFile(join(directory,'provider.json'),'utf8'));
  assert.equal(stored.key,'fixture-secret');assert.equal(stored.model,'next-model');
  await assert.rejects(saveProviderSettings({baseUrl:'https://other.example/v1',model:'test',key:''},directory),/重新填写 API Key/);
  await assert.rejects(saveProviderSettings({baseUrl:'https://other.example/v1',model:'test',key:{}},directory),/重新填写 API Key/);
  assert.equal(JSON.parse(await readFile(join(directory,'provider.json'),'utf8')).key,'fixture-secret');
  await saveProviderSettings({baseUrl:'https://other.example/v1',model:'test',key:'other-fixture-secret'},directory);
  await assert.rejects(saveProviderSettings({baseUrl:'http://remote.example',model:'test',key:''},directory));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('settings reject symlink credential files',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'science-provider-test-'));
 try{
  await writeFile(join(directory,'target'),'{}',{mode:0o600});
  await symlink(join(directory,'target'),join(directory,'provider.json'));
  await assert.rejects(readProviderSettings(directory));
  await assert.rejects(saveProviderSettings({baseUrl:'https://example.com',model:'test',key:'fixture-secret'},directory));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('settings endpoint requires authorization and never sends the key back',async()=>{
 const {providerSettingsHandler}=await import('../lib/index.js');
 const {Readable}=await import('node:stream');
 const directory=await mkdtemp(join(tmpdir(),'science-provider-route-'));
 const invoke=async(handler,method,body='')=>{const req=Readable.from([body]);req.method=method;let value='';const res={statusCode:200,setHeader(){},end(chunk=''){value+=chunk}};await handler(req,res);return {status:res.statusCode,body:value};};
 try{
  const denied=providerSettingsHandler({requestRejection(){return 403}},directory);
  assert.equal((await invoke(denied,'POST','{}')).status,403);
  const handler=providerSettingsHandler({requestRejection(){}},directory);
  const save=await invoke(handler,'POST',JSON.stringify({baseUrl:'https://example.com',model:'fixture-model',key:'fixture-secret'}));
  assert.equal(save.status,200);assert.equal(save.body.includes('fixture-secret'),false);
  const get=await invoke(handler,'GET');assert.equal(get.status,200);assert.equal(get.body.includes('fixture-secret'),false);
  assert.equal((await invoke(handler,'POST','{"key":"fixture-secret" invalid')).body.includes('fixture-secret'),false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
