import {createHash} from 'node:crypto';
import {readFile,realpath,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BackendProcess} from './backend-process.js';
import {discoverScienceRuntime} from './runtime-discovery.js';

const moduleRoot=dirname(fileURLToPath(import.meta.url));
const privateRoot=join(homedir(),'.dsh-science-backend');
function within(path,root) {const r=relative(root,path);return r!=='' && !r.startsWith('..'+sep) && r!=='..' && !isAbsolute(r);}
export async function verifiedBundledBackend() {
  if(process.platform!=='darwin' || process.arch!=='arm64') throw new Error('当前开发版只支持 Apple Silicon Mac');
  const app=join(moduleRoot,'..','third-party','science-backend','DSH Science Backend.app');
  const manifest=JSON.parse(await readFile(join(moduleRoot,'..','third-party','science-backend','integrity.json'),'utf8'));
  const expected=['Contents/MacOS/desktop','Contents/MacOS/csswitch-gateway','Contents/Resources/scripts/launch-virtual-sandbox.sh','Contents/Resources/scripts/stop-science-sandbox.sh','Contents/Resources/scripts/ssh-bridge/ssh'];
  for(const name of expected){
    if(!/^[0-9a-f]{64}$/.test(manifest[name]||''))throw new Error('后台组件校验信息不完整');
    const path=join(app,name);const stat=await lstat(path);
    if(!stat.isFile() || stat.isSymbolicLink())throw new Error('后台组件文件无效');
    const digest=createHash('sha256').update(await readFile(path)).digest('hex');
    if(digest!==manifest[name])throw new Error('后台组件完整性校验失败');
  }
  return join(app,'Contents','MacOS','desktop');
}
export async function backendManagedConfig(port,root=privateRoot) {
  const receipt=JSON.parse(await readFile(join(root,'science-managed-launch.v1.json'),'utf8'));
  if(receipt.port!==port || !isAbsolute(receipt.data_dir||'') || !isAbsolute(receipt.runtime_path||''))throw new Error('后台没有返回可信的 Science 启动记录');
  const [resolvedRoot,dataDir,cli]=await Promise.all([realpath(root),realpath(receipt.data_dir),realpath(receipt.runtime_path)]);
  if(!within(dataDir,resolvedRoot)||!within(cli,resolvedRoot))throw new Error('Science 启动目录不在插件隔离范围内');
  return {cli,dataDir,port};
}
export class BackendRuntime {
  constructor({binaryResolver=verifiedBundledBackend,configResolver=backendManagedConfig,runtimeResolver=binaryResolver===verifiedBundledBackend?discoverScienceRuntime:async()=>null,processFactory=(binary,runtimePath)=>new BackendProcess(binary,{runtimePath})}={}) {
    this.binaryResolver=binaryResolver;this.configResolver=configResolver;this.runtimeResolver=runtimeResolver;this.processFactory=processFactory;this.process=null;this.config=null;this.starting=false;
  }
  async start() {
    if(this.starting)throw new Error('后台操作进行中');
    this.starting=true;
    try {
    if(!this.process)this.process=this.processFactory(await this.binaryResolver(),await this.runtimeResolver());
    try {
      const result=await this.process.start();
      const config=await this.configResolver(result.science_port);
      this.config=config;return {port:config.port};
    } catch(error){
      try{await this.stop();}catch(cleanup){throw new Error(`${error.message}；后台清理尚未完成：${cleanup.message}`);}
      throw error;
    }
    } finally {this.starting=false;}
  }
  async stop(){const child=this.process;if(child)await child.stop();if(this.process===child){this.config=null;this.process=null;}}
}
