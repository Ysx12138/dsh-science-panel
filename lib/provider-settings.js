import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bundledGateway, gatewayProfile, startGateway } from './gateway.js';

const defaultDirectory=join(homedir(),'.config','dsh-science-panel');
const execFileAsync=promisify(execFile);
async function secureWindowsPath(path,isDirectory){
  // Use a fresh ACL, rather than POSIX mode bits (which do not protect files on Windows).
  const script=`$ErrorActionPreference='Stop'
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=if ($env:DSH_SCIENCE_ACL_KIND -eq 'directory') { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner($sid)
$inherit=if ($env:DSH_SCIENCE_ACL_KIND -eq 'directory') { 'ContainerInherit,ObjectInherit' } else { 'None' }
$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl',$inherit,'None','Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $env:DSH_SCIENCE_ACL_PATH -AclObject $acl`;
  await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:15000,windowsHide:true,env:{...process.env,DSH_SCIENCE_ACL_PATH:path,DSH_SCIENCE_ACL_KIND:isDirectory?'directory':'file'}});
}
async function readPrivate(directory) {
  let handle;
  try {
    if(process.platform==='win32'){
      const dirStat=await lstat(directory);
      if(!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('模型配置目录不安全');
      await secureWindowsPath(directory,true);
      const fileStat=await lstat(join(directory,'provider.json'));
      if(!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('模型设置文件不安全');
      await secureWindowsPath(join(directory,'provider.json'),false);
    }
    handle=await open(join(directory,'provider.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
    const stat=await handle.stat();
    if(!stat.isFile() || stat.size>16384 || (process.platform!=='win32' && (stat.mode & 0o077)!==0)) throw new Error('模型设置文件权限无效');
    return JSON.parse(await handle.readFile('utf8'));
  } catch(error) {
    if(error.code==='ENOENT') return null;
    throw new Error('无法读取模型设置，请检查文件权限');
  } finally {await handle?.close();}
}
export async function readProviderSettings(directory=defaultDirectory) {
  const settings=await readPrivate(directory);
  return settings ? {baseUrl:settings.baseUrl,model:settings.model,keyConfigured:!!settings.key,active:false} : {baseUrl:'',model:'',keyConfigured:false,active:false};
}
export async function saveProviderSettings(input,directory=defaultDirectory) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('模型设置无效');
  const previous=await readPrivate(directory);
  if (previous && !(typeof input.key==='string' && input.key.length>0)) {
    let oldOrigin, newOrigin;
    try {oldOrigin=new URL(previous.baseUrl).origin;newOrigin=new URL(input.baseUrl).origin;} catch {throw new Error('服务地址无效');}
    if(oldOrigin!==newOrigin)throw new Error('服务地址的来源已改变，请重新填写 API Key');
  }
  const key=typeof input.key==='string' && input.key ? input.key : previous?.key;
  const profile=gatewayProfile({protocol:'anthropic',baseUrl:input.baseUrl,model:input.model,key,contractDigest:'0'.repeat(64)});
  await mkdir(directory,{recursive:true,mode:0o700});
  const dirStat=await lstat(directory);
  if(!dirStat.isDirectory() || dirStat.isSymbolicLink() || (process.platform!=='win32' && dirStat.uid!==process.getuid()))throw new Error('模型配置目录不安全');
  if(process.platform==='win32') await secureWindowsPath(directory,true); else await chmod(directory,0o700);
  const temporary=join(directory,`.provider-${randomBytes(16).toString('hex')}.tmp`);
  let file;
  try {
    file=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    await file.writeFile(JSON.stringify({baseUrl:profile.endpoint,model:input.model,key})+'\n','utf8');
    await file.sync();await file.close();file=null;
    await rename(temporary,join(directory,'provider.json'));
  } finally {await file?.close();await unlink(temporary).catch(()=>{});}
  return {baseUrl:profile.endpoint,model:input.model,keyConfigured:true,active:false};
}

// The launcher calls this only after it has selected a trusted gateway build.
// It is deliberately not exposed as a web endpoint until Science can be
// launched and stopped as one lifecycle.
export async function startConfiguredGateway({binary,contractDigest,directory=defaultDirectory,timeoutMs}) {
  const settings=await readPrivate(directory);
  if(!settings) throw new Error('请先填写模型设置');
  const profile=gatewayProfile({...settings,protocol:'anthropic',contractDigest});
  return startGateway({binary,profile,timeoutMs});
}

export async function startBundledConfiguredGateway({directory=defaultDirectory,timeoutMs}={}) {
  const runtime=await bundledGateway();
  return startConfiguredGateway({...runtime,directory,timeoutMs});
}

// Called only by the local backend process manager, never returned to the UI.
export async function providerForBackend(directory=defaultDirectory) {
  const settings=await readPrivate(directory);
  if(!settings) throw new Error('请先填写模型设置');
  gatewayProfile({...settings,protocol:'anthropic',contractDigest:'0'.repeat(64)});
  return settings;
}
