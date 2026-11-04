// Experimental gateway adapter. The catalog fingerprint format is derived from
// CSSwitch (MIT), copyright 2026 shanjunjie; see third-party/CSSwitch-LICENSE.
// This module is not wired to the plugin UI or the Science launcher yet.
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export function gatewayProfile({ protocol, baseUrl, model, key, contractDigest }) {
  if (protocol !== 'anthropic') throw new Error('仅支持 Anthropic 兼容接口');
  let endpoint;
  try { endpoint = new URL(baseUrl); } catch { throw new Error('服务地址无效'); }
  if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search || !(endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)))) throw new Error('服务地址必须是 HTTPS，或本机测试地址');
  if (typeof model !== 'string' || !model.trim() || model !== model.trim() || Buffer.byteLength(model) > 256 || /[\x00-\x1f\x7f]/.test(model)) throw new Error('模型名称无效');
  if (typeof key !== 'string' || !key.trim() || /[\r\n\0]/.test(key)) throw new Error('API Key 无效');
  if (!/^[0-9a-f]{64}$/.test(contractDigest || '')) throw new Error('未提供可信的网关版本校验值');
  const adapter = 'relay';
  const selector = `claude-csswitch-custom-${createHash('sha256').update(model).digest('hex').slice(0,12)}`;
  const roles = Object.fromEntries(['sonnet','opus','haiku','fable'].map(role => [role, selector]));
  const catalog = {schema_version:1, adapter, default_selector_id:selector, routes:[{selector_id:selector,display_name:model,upstream_model:model,supports_tools:true}], role_bindings:roles, legacy_aliases:[]};
  // This is the exact length-prefixed format consumed by CSSwitch gateway.
  const hash=createHash('sha256');
  const integer=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);hash.update(b);};
  const text=s=>{const b=Buffer.from(s);integer(b.length);hash.update(b);};
  hash.update('csswitch-static-catalog-fp-v1\0');integer(1);text(adapter);text(selector);integer(1);
  text(selector);text(model);text(model);hash.update(Buffer.from([2]));text('none');hash.update(Buffer.from([0,0,0]));
  for(const role of ['sonnet','opus','haiku','fable'])text(roles[role]);integer(0);
  catalog.catalog_fp=hash.digest('hex');
  return {adapter, contractId:'custom-anthropic', contractDigest, endpoint:endpoint.toString().replace(/\/$/,''), key, catalog};
}

async function freePort() {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

export async function startGateway({ binary, profile, timeoutMs=5000 }) {
  if (typeof binary !== 'string' || !binary.startsWith('/')) throw new Error('网关路径必须为绝对路径');
  const port=await freePort();
  const token=randomBytes(32).toString('hex');
  const base=`http://127.0.0.1:${port}/${token}`;
  const env={ PATH:'/usr/bin:/bin', LANG:'en_US.UTF-8', CSSWITCH_AUTH_TOKEN:token,
    CSSWITCH_PROVIDER_CONTRACT_ID:profile.contractId, CSSWITCH_PROVIDER_CONTRACT_DIGEST:profile.contractDigest,
    CSSWITCH_STATIC_MODEL_CATALOG_V1:JSON.stringify(profile.catalog) };
  env.CSSWITCH_RELAY_KEY=profile.key;env.CSSWITCH_RELAY_BASE_URL=profile.endpoint;
  const child=spawn(binary,['--provider',profile.adapter,'--port',String(port)],{env,stdio:'ignore'});
  let childError;child.once('error',error=>{childError=error;});
  let ready=false;
  try {
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      if(childError || child.exitCode!==null || child.signalCode!==null) throw new Error('网关启动失败，请检查组件版本');
      try {
        const response=await fetch(`${base}/health`,{signal:AbortSignal.timeout(300)});
        const status=await response.json();
        if(response.ok && status.provider===profile.adapter && status.provider_contract_id===profile.contractId && status.provider_contract_digest===profile.contractDigest && status.catalog_fp===profile.catalog.catalog_fp){ready=true;break;}
      } catch {}
      await delay(50);
    }
    if(!ready) throw new Error('网关未能就绪');
    return {baseUrl:base, child, stop:()=>{if(child.exitCode===null && child.signalCode===null)child.kill('SIGTERM');}};
  } catch(error) { if(child.pid && child.exitCode===null && child.signalCode===null)child.kill('SIGTERM');throw error; }
}

export async function bundledGateway() {
  if(process.platform!=='darwin' || process.arch!=='arm64') throw new Error('此开发版仅支持 Apple Silicon Mac');
  const binary=fileURLToPath(new URL('../third-party/csswitch-macos-arm64/csswitch-gateway',import.meta.url));
  const hash=createHash('sha256').update(await readFile(binary)).digest('hex');
  if(hash!=='4448c15ef261025458486e3297188b98d96f177e627f7b2d864fe094de08757a') throw new Error('后台组件完整性校验失败');
  return {binary,contractDigest:'141a8f7a43055ab08ff820ab807139630989e631ff8dd58629eea588bdb1dc14'};
}
