import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {readFile,lstat,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';import {homedir} from 'node:os';import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {installWindowsScience} from './windows-science-runtime.js';
import {prepareWindowsSandbox} from './windows-sandbox.js';
import {gatewayProfile,startGateway} from './gateway.js';
import {providerForBackend} from './provider-settings.js';
const exec=promisify(execFile);
export async function bundledWindowsGateway(){
 const folder=fileURLToPath(new URL('../third-party/science-backend/windows-x64/',import.meta.url));
 const binary=join(folder,'csswitch-gateway.exe'),manifest=JSON.parse(await readFile(join(folder,'integrity.json'),'utf8'));
 const stat=await lstat(binary);
 if(!stat.isFile()||stat.isSymbolicLink()||!/^([a-f0-9]{64})$/.test(manifest.sha256||'')||createHash('sha256').update(await readFile(binary)).digest('hex')!==manifest.sha256||!/^([a-f0-9]{64})$/.test(manifest.contractDigest||''))throw new Error('Windows 网关完整性校验失败');
 return {binary,contractDigest:manifest.contractDigest};
}
async function freePort(){const server=createServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes)});const p=server.address().port;await new Promise(yes=>server.close(yes));return p;}
export class WindowsBackendRuntime {
 constructor({root=join(homedir(),'.dsh-science-backend'),installer=installWindowsScience,gatewayResolver=bundledWindowsGateway,settingsResolver=providerForBackend,sandboxResolver=prepareWindowsSandbox,timeoutMs=90000}={}){
  Object.assign(this,{root,installer,gatewayResolver,settingsResolver,sandboxResolver,timeoutMs});this.config=null;this.child=null;this.gateway=null;this.lock=null;this.busy=false;
 }
 async start(){
  if(this.busy)throw new Error('后台操作进行中');
  if(this.config)return {port:this.config.port};
  this.busy=true;
  try{
   const settings=await this.settingsResolver();
   const cli=await this.installer({root:this.root});
   const lockPath=join(this.root,'windows-owner.lock');
   try{this.lock=await open(lockPath,'wx');await this.lock.writeFile(String(process.pid));}catch{throw new Error('Windows Science 目录已被占用，请先停止正在使用它的 DSH 后台');}
   const {dataDir}=await this.sandboxResolver(this.root);
   const runtime=await this.gatewayResolver();
   const profile=gatewayProfile({...settings,protocol:'anthropic',contractDigest:runtime.contractDigest});
   this.gateway=await startGateway({...runtime,profile,timeoutMs:10000});
   const port=await freePort();let preview=await freePort();while(preview===port)preview=await freePort();
   // Keep Windows Known Folders intact. --data-dir isolates Science auth/state.
   const env={...process.env,ANTHROPIC_BASE_URL:this.gateway.baseUrl};
   delete env.ANTHROPIC_API_KEY;delete env.ANTHROPIC_AUTH_TOKEN;
   this.launch={cli,dataDir,env};
   this.child=spawn(cli,['serve','--data-dir',dataDir,'--host','127.0.0.1','--port',String(port),'--sandbox-port',String(preview),'--no-browser','--no-auto-update'],{env,stdio:'ignore',windowsHide:true});
   let failed=false;this.child.once('error',()=>{failed=true});
   let ready=false;const deadline=Date.now()+this.timeoutMs;
   while(Date.now()<deadline){
    if(failed||this.child.exitCode!==null||this.child.signalCode!==null)throw new Error('Windows Science 启动失败，请检查 Science 的 sandbox doctor 诊断');
    try{const response=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(500)});await response.arrayBuffer();if(response.status<500){ready=true;break;}}catch{}
    await delay(250);
   }
   if(!ready)throw new Error('Windows Science 启动超时');
   this.config={cli,dataDir,port};return {port};
  }catch(error){
   try{await this.stop();}catch{throw new Error(`${error.message}；后台清理尚未完成，请重试停止`);}
   throw error;
  }finally{this.busy=false;}
 }
 async stop(){
  const child=this.child;
  if(child?.pid&&child.exitCode===null&&child.signalCode===null){
   try{await exec(this.launch.cli,['stop','--data-dir',this.launch.dataDir],{env:this.launch.env,timeout:20000,windowsHide:true,maxBuffer:8192});}
   catch{throw new Error('Science 停止未确认，保留后台所有权以便重试');}
   const deadline=Date.now()+15000;
   while(child.exitCode===null&&child.signalCode===null&&Date.now()<deadline)await delay(100);
   if(child.exitCode===null&&child.signalCode===null)throw new Error('Science 进程尚未退出');
  }
  this.child=null;
  if(this.gateway){const c=this.gateway.child;this.gateway.stop();const deadline=Date.now()+5000;while(c.exitCode===null&&c.signalCode===null&&Date.now()<deadline)await delay(50);if(c.exitCode===null&&c.signalCode===null)throw new Error('Windows 网关尚未退出');this.gateway=null;}
  if(this.lock){await this.lock.close();await unlink(join(this.root,'windows-owner.lock'));this.lock=null;}
  this.config=null;this.launch=null;
 }
}
