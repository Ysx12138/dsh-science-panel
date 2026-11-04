import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, extname, join, sep } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, localScienceUrl } from './config.js';
import { readProviderSettings, saveProviderSettings } from './provider-settings.js';
import { BackendRuntime } from './backend-runtime.js';

const exec = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const inject = ['webServer', 'connection'];

async function queryArtifact(db,sql) {
  // Recent Node versions include SQLite, avoiding a separately installed CLI
  // on Windows. Keep the existing CLI path for hosts using Node 20.
  const sqlite=await import('node:sqlite').catch(()=>null);
  if(sqlite?.DatabaseSync){
    const connection=new sqlite.DatabaseSync(db,{readOnly:true});
    try{return connection.prepare(sql).get();}finally{connection.close();}
  }
  const {stdout}=await exec('sqlite3',['-readonly','-json',db,sql],{timeout:5000,maxBuffer:65536});
  return JSON.parse(stdout||'[]')[0];
}

export async function findArtifact(dataDir, artifactId, versionId) {
  if ((artifactId && !UUID.test(artifactId)) || (versionId && !UUID.test(versionId)) || (!artifactId && !versionId)) throw new Error('无效的文件标识');
  const orgRoot = join(dataDir, 'orgs');
  const orgs = await readdir(orgRoot, {withFileTypes:true}).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  const candidates = [dataDir, ...orgs.filter(item => item.isDirectory()).map(item => join(orgRoot, item.name))];
  const condition = versionId ? `v.id='${versionId}'${artifactId ? ` AND a.id='${artifactId}'` : ''}` : `a.id='${artifactId}' AND v.id=a.latest_version_id`;
  const sql = `SELECT a.filename,v.storage_path FROM artifacts a JOIN artifact_versions v ON v.artifact_id=a.id WHERE ${condition} LIMIT 1`;
  const found = [];
  for (const dir of candidates) {
    const db = join(dir, 'operon-cli.db');
    try { if (!(await stat(db)).isFile()) continue; }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    try {
      const row = await queryArtifact(db,sql);
      if (row?.storage_path && row.filename) found.push({dir, ...row});
    } catch (error) {
      // Older legacy databases may not have the artifact schema.
      if (String(error.stderr || error.message || '').includes('no such table:')) continue;
      throw new Error('无法读取 Science 文件索引，请检查 sqlite3 和数据目录');
    }
  }
  if (found.length !== 1) throw new Error(found.length ? '多个数据目录包含此文件，请指定正确的数据目录' : '未找到该版本的文件');
  const row = found[0];
  const root = await realpath(join(row.dir, 'artifacts'));
  const source = await realpath(join(root, row.storage_path));
  if (!source.startsWith(root + sep)) throw new Error('文件位置不受支持');
  const name = basename(row.filename).replace(/[\x00-\x1f/\\:]/g, '_');
  if (!name || name === '.' || name === '..') throw new Error('文件名无效');
  return {source, name};
}

export async function saveDownload(source, name, downloads = join(homedir(), 'Downloads')) {
  const extension = extname(name), stem = name.slice(0, name.length - extension.length);
  for (let i=0; i<1000; i++) {
    const candidate = join(downloads, i ? `${stem} (${i})${extension}` : name);
    try { await copyFile(source, candidate, constants.COPYFILE_EXCL); return basename(candidate); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('无法创建下载文件');
}

export function providerSettingsHandler(connection, directory) {
  return async (req,res)=>{
    const rejected=connection.requestRejection(req);
    if(rejected!==undefined){res.statusCode=rejected;res.end();return;}
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    try {
      if(req.method==='GET'){res.end(JSON.stringify(await readProviderSettings(directory)));return;}
      if(req.method!=='POST'){res.statusCode=405;res.end();return;}
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)throw new Error('请求过大');}
      let input;try{input=JSON.parse(body);}catch{throw new Error('请求格式无效');}
      res.end(JSON.stringify(await saveProviderSettings(input,directory)));
    } catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message || '无法保存模型设置'}));}
  };
}

export function apply(ctx) {
  const backend=new BackendRuntime();
  ctx.effect(() => () => {backend.stop().catch(()=>{});});
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/science-panel/localization',handler:async(req,res)=>{
    const rejected=ctx.connection.requestRejection(req);
    if(rejected!==undefined){res.statusCode=rejected;res.end();return;}
    if(req.method!=='GET'){res.statusCode=405;res.end();return;}
    try {
      const [dictionary,injector]=await Promise.all([
        readFile(new URL('./localization/zh-dict.json',import.meta.url),'utf8'),
        readFile(new URL('./localization/zh-inject.js',import.meta.url),'utf8')
      ]);
      const safeDictionary=JSON.stringify(JSON.parse(dictionary));
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/javascript; charset=utf-8');
      res.end(`window.__SCI_ZH=window.__SCI_ZH||${safeDictionary};\n${injector}`);
    } catch {res.statusCode=500;res.end('Unable to load localization');}
  }}),'science-panel: localization');
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/science-panel/backend',handler:async(req,res)=>{
    const rejected=ctx.connection.requestRejection(req);
    if(rejected!==undefined){res.statusCode=rejected;res.end();return;}
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    if(req.method!=='POST'){res.statusCode=405;res.end();return;}
    try {
      let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)throw new Error('请求过大');}
      const {action}=JSON.parse(body);
      if(action==='start'){res.end(JSON.stringify({ok:true,...await backend.start()}));return;}
      if(action==='stop'){await backend.stop();res.end(JSON.stringify({ok:true}));return;}
      throw new Error('未知操作');
    } catch(error){res.statusCode=503;res.end(JSON.stringify({error:error.message||'后台操作未完成'}));}
  }}),'science-panel: managed backend');
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/science-panel/provider-settings',handler:providerSettingsHandler(ctx.connection)}),'science-panel: provider settings');
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/science-panel/login',handler:async(req,res)=>{
    const rejected=ctx.connection.requestRejection(req);
    if(rejected!==undefined){res.statusCode=rejected;res.end();return;}
    if(req.method!=='POST'){res.statusCode=405;res.end();return;}
    try {
      const config=backend.config || await loadConfig();
      const {stdout}=await exec(config.cli,['url','--data-dir',config.dataDir],{timeout:12000,maxBuffer:8192});
      const match=stdout.match(/https?:\/\/[^\s\x1b]+/);
      if(!match)throw new Error('Science 未返回登录入口');
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({url:localScienceUrl(match[0],config.port),port:config.port}));
    } catch(error) {res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message || 'Science 未运行或暂时无法连接'}));}
  }}),'science-panel: local login');
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/science-panel/download-artifact',handler:async(req,res)=>{
    const rejected=ctx.connection.requestRejection(req);
    if(rejected!==undefined){res.statusCode=rejected;res.end();return;}
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    if(req.method!=='POST'){res.statusCode=405;res.end();return;}
    try {
      let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw new Error('请求过大');}
      const {artifactId,versionId}=JSON.parse(body);
      const {dataDir}=backend.config || await loadConfig();
      const {source,name}=await findArtifact(dataDir,artifactId,versionId);
      res.end(JSON.stringify({ok:true,filename:await saveDownload(source,name)}));
    }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message || '下载失败'}));}
  }}),'science-panel: download artifact');
}
