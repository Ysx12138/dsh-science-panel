import {lstat,mkdir,mkdtemp,writeFile,readFile,rename,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createLocalLogin,decryptLocalToken} from './windows-login.js';
import {secureWindowsPath} from './provider-settings.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function regularText(file){const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw new Error('Science 隔离登录文件无效');return readFile(file,'utf8');}
export async function prepareWindowsSandbox(root,{protect=secureWindowsPath}={}){
 const home=join(root,'sandbox-windows'),dataDir=join(home,'.claude-science');
 const rootStat=await lstat(root);
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('Science 隔离根目录无效');
 await protect(root,true);
 try{
  for(const directory of [root,home,dataDir,join(dataDir,'.oauth-tokens')]){const st=await lstat(directory);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('Science 隔离登录目录无效');await protect(directory,true);}
  const identity=JSON.parse(await regularText(join(home,'dsh-identity.json')));
  if(!uuid.test(identity.account)||!uuid.test(identity.org))throw new Error('Science 隔离身份无效');
  const active=JSON.parse(await regularText(join(dataDir,'active-org.json')));
  const key=(await regularText(join(dataDir,'encryption.key'))).match(/^OAUTH_ENCRYPTION_KEY=(.+)$/m)?.[1];
  const names=await readdir(join(dataDir,'.oauth-tokens'));
  if(!key||names.filter(n=>n.endsWith('.enc')).length!==1)throw new Error('Science 隔离登录配置无效');
  const token=decryptLocalToken(await regularText(join(dataDir,'.oauth-tokens',identity.account+'.enc')),key);
  if(token.account_uuid!==identity.account||token.org_uuid!==identity.org||active.org_uuid!==identity.org||token.email!=='virtual@localhost.invalid')throw new Error('Science 隔离登录身份不一致');
  return {home,dataDir};
 }catch(error){
  // Only a completely absent sandbox permits initialization. Partial state is
  // preserved for diagnosis rather than silently changing its organization.
  try{await lstat(home);}catch(absent){if(absent.code==='ENOENT')return initialize();throw absent;}
  throw error;
 }
 async function initialize(){
  const stage=await mkdtemp(join(root,'.sandbox-windows-'));
  try{
   await protect(stage,true);const data=join(stage,'.claude-science');await mkdir(data);await mkdir(join(data,'.oauth-tokens'));
   const login=createLocalLogin();
   await writeFile(join(data,'encryption.key'),login.keyFile,{flag:'wx',mode:0o600});
   await writeFile(join(data,'active-org.json'),JSON.stringify({org_uuid:login.org}),{flag:'wx',mode:0o600});
   await writeFile(join(data,'.oauth-tokens',login.account+'.enc'),login.encryptedToken,{flag:'wx',mode:0o600});
   await writeFile(join(stage,'dsh-identity.json'),JSON.stringify({account:login.account,org:login.org}),{flag:'wx',mode:0o600});
   await rename(stage,home);return {home,dataDir};
  }finally{await rm(stage,{recursive:true,force:true});}
 }
}
