import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {isAbsolute} from 'node:path';
import { providerForBackend } from './provider-settings.js';

const marker='DSH_SCIENCE_RESULT:';
async function reserveCandidate() {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}
export class BackendProcess {
  constructor(binary,{args=[],directory,runtimePath,timeoutMs=120000}={}) {
    if(typeof binary!=='string' || !isAbsolute(binary))throw new Error('后台程序路径无效');
    this.binary=binary;this.args=args;this.directory=directory;this.runtimePath=runtimePath;this.timeoutMs=timeoutMs;
    this.child=null;this.pending=null;this.starting=false;this.buffer='';
  }
  async start() {
    if(this.starting || this.pending)throw new Error('后台操作进行中');
    this.starting=true;
    try {
    const settings=await providerForBackend(this.directory);
    let proxy=await reserveCandidate(), science=await reserveCandidate();
    while(science===proxy || science===65535 || science+1===proxy || science===8765 || science+1===8765)science=await reserveCandidate();
    if(!this.child || this.child.exitCode!==null || this.child.signalCode!==null){
      const env={...process.env};if(this.runtimePath)env.SCIENCE_BIN=this.runtimePath;
      const child=spawn(this.binary,this.args,{stdio:['pipe','pipe','ignore'],env});
      this.child=child;this.buffer='';
      child.stdin.on('error',()=>this.finish(new Error('后台通信失败')));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data',chunk=>this.consume(child,chunk));
      child.on('error',()=>this.finish(new Error('后台启动失败')));
      child.on('exit',()=>{if(this.child===child)this.child=null;this.finish(new Error('后台已退出'));});
    }
    return await this.request({command:'configure_start',base_url:settings.baseUrl,model:settings.model,key:settings.key,proxy_port:proxy,science_port:science});
    } finally {this.starting=false;}
  }
  request(body) {
    if(!this.child || this.pending)throw new Error('后台不可用');
    return new Promise((resolve,reject)=>{
      // Preserve the controller on timeout: it owns detached Science/Gateway
      // cleanup, so terminating it can leave both services orphaned.
      const timer=setTimeout(()=>{this.finish(new Error('后台响应超时，请重试停止操作'));},this.timeoutMs);
      this.pending={resolve,reject,timer,command:body.command};
      this.child.stdin.write(JSON.stringify(body)+'\n',error=>{if(error)this.finish(new Error('后台通信失败'));});
    });
  }
  consume(child,chunk) {
    if(this.child!==child)return;
    this.buffer+=chunk;
    if(this.buffer.length>65536){this.finish(new Error('后台响应异常'));child.kill('SIGTERM');return;}
    let index;
    while((index=this.buffer.indexOf('\n'))>=0){
      const line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);
      if(!line.startsWith(marker))continue;
      try{
        const result=JSON.parse(line.slice(marker.length));
        const valid=this.pending?.command==='stop' ? result.result?.status==='stopped' : Number.isInteger(result.result?.science_port);
        if(result.ok && valid)this.finish(null,result.result);
        else this.finish(new Error(typeof result.error==='string' ? result.error.slice(0,2000) : '后台操作未完成，请检查 Science 安装和模型配置'));
      }
      catch{this.finish(new Error('后台响应异常'));}
    }
  }
  finish(error,value) {
    if(!this.pending)return;
    const pending=this.pending;this.pending=null;clearTimeout(pending.timer);
    if(error)pending.reject(error);else pending.resolve(value);
  }
  async stop() {
    if(!this.child)return;
    const child=this.child;
    if(child.exitCode!==null || child.signalCode!==null){this.child=null;return;}
    // Wait for confirmed managed cleanup before closing the control channel.
    // The old ten-second EOF timeout could kill the owner during Science stop.
    await this.request({command:'stop'});
    child.stdin.end();
    await new Promise((resolve,reject)=>{if(child.exitCode!==null || child.signalCode!==null)return resolve();const timer=setTimeout(()=>{reject(new Error('后台已停止服务，但控制进程尚未退出'));},30000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
  }
}
