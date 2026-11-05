import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat,mkdir,mkdtemp,link,rm,realpath} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {secureWindowsPath} from './provider-settings.js';
const exec=promisify(execFile);
export const WINDOWS_SCIENCE_URL='https://downloads.claude.ai/claude-science/latest/windows-x64.exe';
export async function verifyWindowsScience(binary){
 const stat=await lstat(binary);
 if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Science 程序文件无效');
 const script=`$ErrorActionPreference='Stop'
Import-Module (Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Security') -Force
$s=Get-AuthenticodeSignature -LiteralPath $env:DSH_SCIENCE_VERIFY_FILE
if ($s.Status -ne 'Valid' -or $s.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -ne 'Anthropic, PBC') { throw 'Science publisher verification failed' }`;
 try{await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:60000,windowsHide:true,env:{...process.env,DSH_SCIENCE_VERIFY_FILE:binary}});}
 catch{throw new Error('Science 官方签名验证失败');}
}
// Download only. The controller separately owns starting/stopping the runtime.
export async function installWindowsScience({root=join(homedir(),'.dsh-science-backend'),platform=process.platform,arch=process.arch,verify=verifyWindowsScience,protect=secureWindowsPath,download=async destination=>{
 await exec('curl.exe',['--fail','--location','--silent','--show-error','--proto','=https','--proto-redir','=https','--connect-timeout','20','--max-time','900','--max-filesize','400000000','--output',destination,WINDOWS_SCIENCE_URL],{timeout:910000,windowsHide:true,maxBuffer:65536});
}}={}){
 if(platform!=='win32'||arch!=='x64')throw new Error('Windows Science 需要 Windows x64');
 if(!isAbsolute(root))throw new Error('Science 隔离目录必须是绝对路径');
 for(const directory of [root,join(root,'runtime-windows')]){
  await mkdir(directory,{recursive:true});const st=await lstat(directory);
  if(!st.isDirectory()||st.isSymbolicLink())throw new Error('Science 隔离目录不安全');
  await protect(directory,true);
 }
 const directory=await realpath(join(root,'runtime-windows'));
 const binary=join(directory,'claude-science.exe');
 try{await lstat(binary);await verify(binary);return binary;}catch(error){if(error.code!=='ENOENT')throw error;}
 const stage=await mkdtemp(join(directory,'.download-'));
 try{
  await protect(stage,true);
  const candidate=join(stage,'claude-science.exe');
  await download(candidate);await verify(candidate);
  // Hard-link is an atomic no-replace publish on NTFS; a concurrent install
  // must be verified instead of overwriting an existing executable.
  try{await link(candidate,binary);}catch(error){if(error.code!=='EEXIST')throw error;}
  await verify(binary);return binary;
 }finally{await rm(stage,{recursive:true,force:true});}
}
