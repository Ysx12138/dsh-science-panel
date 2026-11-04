import {execFile} from 'node:child_process';
import {access, lstat, mkdir, mkdtemp, rename, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';

const exec=promisify(execFile);
export const SCIENCE_APP='/Applications/Claude Science.app';
const OFFICIAL_DMG='https://downloads.claude.ai/claude-science/latest/mac-arm64.dmg';
const SIGNATURE='=anchor apple generic and identifier "com.anthropic.operon" and certificate leaf[subject.OU] = "Q6L2SF6YDW"';

export async function scienceInstalled(destination=SCIENCE_APP) {
  try {await access(join(destination,'Contents/Resources/bin/claude-science'),constants.X_OK);return true;}
  catch {return false;}
}

export function parseSystemHttpsProxy(text) {
  if(!/^\s*HTTPSEnable\s*:\s*1\s*$/m.test(text))return null;
  const host=text.match(/^\s*HTTPSProxy\s*:\s*([^\s]+)\s*$/m)?.[1];
  const port=Number(text.match(/^\s*HTTPSPort\s*:\s*(\d+)\s*$/m)?.[1]);
  if(!host||!/^[a-zA-Z0-9.:-]+$/.test(host)||!Number.isInteger(port)||port<1||port>65535)return null;
  return `http://${host.includes(':')?`[${host}]`:host}:${port}`;
}
async function downloadOfficial(path) {
  try {
    const args=['--fail','--location','--silent','--show-error','--proto','=https','--proto-redir','=https','--connect-timeout','20','--max-time','900','--max-filesize','400000000','--output',path];
    if(!process.env.HTTPS_PROXY&&!process.env.https_proxy){
      const proxy=await exec('/usr/sbin/scutil',['--proxy'],{timeout:5000,maxBuffer:65536}).then(r=>parseSystemHttpsProxy(r.stdout)).catch(()=>null);
      if(proxy)args.push('--proxy',proxy);
    }
    await exec('/usr/bin/curl',[...args,OFFICIAL_DMG],{timeout:910000,maxBuffer:65536});
  } catch {throw new Error('无法下载官方安装包，请检查网络后重试');}
}

// The destination is injectable for tests. The HTTP route uses only the fixed default.
export async function installScience({destination=SCIENCE_APP,download=downloadOfficial,workRoot=tmpdir(),platform=process.platform,arch=process.arch}={}) {
  if(platform!=='darwin'||arch!=='arm64')throw new Error('当前版本需要 Apple Silicon Mac');
  if(await scienceInstalled(destination))return {installed:true,alreadyInstalled:true};
  try {await lstat(destination);throw new Error('应用程序文件夹已有同名项目，请先检查现有文件');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const temp=await mkdtemp(join(workRoot,'dsh-science-setup-'));
  const mount=join(temp,'mount'),dmg=join(temp,'science.dmg');
  let mounted=false,staged;
  try {
    await mkdir(mount);
    await download(dmg);
    await exec('/usr/bin/hdiutil',['attach',dmg,'-readonly','-nobrowse','-mountpoint',mount,'-quiet'],{timeout:120000,maxBuffer:65536});
    mounted=true;
    const source=join(mount,'Claude Science.app');
    const verify=async path=>exec('/usr/bin/codesign',['--verify','--deep','--strict','-R',SIGNATURE,path],{timeout:120000,maxBuffer:65536});
    try {await verify(source);}catch{throw new Error('官方应用签名验证失败，安装已停止');}
    if(!await scienceInstalled(source))throw new Error('安装包中没有可用的 Claude Science');
    try {staged=await mkdtemp(join(dirname(destination),'.dsh-science-'));}
    catch {throw new Error('无法写入“应用程序”文件夹，请检查 macOS 权限后重试');}
    const candidate=join(staged,'Claude Science.app');
    await exec('/usr/bin/ditto',[source,candidate],{timeout:120000,maxBuffer:65536});
    await verify(candidate);
    // macOS rename will not replace an existing non-empty app; check again so
    // even a newly created empty destination is not intentionally overwritten.
    try {await lstat(destination);throw new Error('安装期间发现同名应用，请检查后重试');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    await rename(candidate,destination);
    return {installed:true,alreadyInstalled:false};
  } finally {
    if(mounted)await exec('/usr/bin/hdiutil',['detach',mount,'-quiet'],{timeout:30000,maxBuffer:65536}).catch(()=>{});
    if(staged)await rm(staged,{recursive:true,force:true}).catch(()=>{});
    await rm(temp,{recursive:true,force:true}).catch(()=>{});
  }
}
