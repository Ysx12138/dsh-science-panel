import {createServer} from 'node:net';
import {realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {join} from 'node:path';import {tmpdir} from 'node:os';
// A Windows named pipe is held by the OS and disappears if its process dies.
// Unlike a stale PID file, it serializes the complete recovery transaction.
export async function acquireWindowsOwner(root){
 const resolved=await realpath(root);
 const digest=createHash('sha256').update(process.platform==='win32'?resolved.toLowerCase():resolved).digest('hex').slice(0,24);
 const endpoint=process.platform==='win32'?'\\\\.\\pipe\\dsh-science-owner-'+digest:join(tmpdir(),'dsh-owner-'+digest);
 const server=createServer(socket=>socket.destroy());
 try{await new Promise((yes,no)=>{server.once('error',no);server.listen({path:endpoint,exclusive:true},yes);});}
 catch{throw new Error('Windows Science 目录已被占用，请先停止正在使用它的 DSH 后台');}
 return ()=>new Promise((yes,no)=>server.close(error=>error?no(error):yes()));
}
const environmentNames=['SystemRoot','WINDIR','SystemDrive','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','TEMP','TMP','PATH','PATHEXT','COMSPEC','USERNAME','USERDOMAIN','ProgramData','ProgramFiles','ProgramFiles(x86)','CommonProgramFiles','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','OS','LANG','LC_ALL','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY'];
export function windowsScienceEnvironment(gatewayUrl,source=process.env){
 const env={};
 for(const name of environmentNames){const key=Object.keys(source).find(k=>k.toLowerCase()===name.toLowerCase());if(key!==undefined)env[name]=source[key];}
 if(gatewayUrl)env.ANTHROPIC_BASE_URL=gatewayUrl;return env;
}
