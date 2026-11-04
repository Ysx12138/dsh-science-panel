import {createHash,randomBytes} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';
import {access,chmod,copyFile,link,lstat,mkdir,readdir,realpath,unlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join} from 'node:path';

const exec=promisify(execFile);
const appBinary='/Applications/Claude Science.app/Contents/Resources/bin/claude-science';
async function signedByAnthropic(path){
  const requirement='=anchor apple generic and identifier "com.anthropic.operon.cli" and certificate leaf[subject.OU] = "Q6L2SF6YDW"';
  try {await exec('/usr/bin/codesign',['--verify','--strict','-R',requirement,path],{timeout:30000,maxBuffer:8192});return true;}
  catch{return false;}
}
async function sha256(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}

async function prepareManagedCopy(source,expected,managedRoot,verify){
  for(const dir of [managedRoot,join(managedRoot,'runtime-snapshots'),join(managedRoot,'runtime-snapshots','science')]){
    await mkdir(dir,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const st=await lstat(dir);
    if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o022)!==0)throw new Error('Science 隔离目录权限不安全');
  }
  const root=await realpath(join(managedRoot,'runtime-snapshots','science'));
  const dest=join(root,'claude-science-'+expected);
  if(source!==dest){
    const temporary=join(root,`.science-import-${randomBytes(16).toString('hex')}`);
    try{
      await copyFile(source,temporary,constants.COPYFILE_EXCL);
      await chmod(temporary,0o500);
      if(await sha256(temporary)!==expected||!await verify(temporary))throw new Error('Science 缓存复制后的校验失败');
      try{await link(temporary,dest);}catch(error){if(error.code!=='EEXIST')throw error;}
    }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  const st=await lstat(dest);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077)!==0||!(st.mode&0o100)||await sha256(dest)!==expected||!await verify(dest))throw new Error('隔离目录中的 Science 缓存未通过校验');
  return realpath(dest);
}

// null means the installed Science app can be selected by CSSwitch itself.
export async function discoverScienceRuntime({app=appBinary,managedRoot=join(homedir(),'.dsh-science-backend'),roots=[join(managedRoot,'runtime-snapshots','science'),join(homedir(),'.csswitch','runtime-snapshots','science')],verify=signedByAnthropic}={}){
  try{await access(app,constants.X_OK);return null;}catch{}
  for(const root of roots){
    let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
    const candidates=[];
    for(const entry of entries){
      const match=/^claude-science-([a-f0-9]{64})$/.exec(entry.name);
      if(!entry.isFile()||!match)continue;
      const path=join(root,entry.name),st=await lstat(path);
      if(!st.isFile()||st.isSymbolicLink()||!(st.mode&0o100))continue;
      candidates.push({path,st,expected:match[1]});
    }
    candidates.sort((a,b)=>b.st.mtimeMs-a.st.mtimeMs);
    for(const c of candidates){
      const resolved=await realpath(c.path);
      if(await sha256(resolved)===c.expected && await verify(resolved))return prepareManagedCopy(resolved,c.expected,managedRoot,verify);
    }
  }
  throw new Error('没有找到 Claude Science。请先准备 Science 本体；如果本机已有 CSSwitch 缓存，请检查缓存是否完整。');
}
