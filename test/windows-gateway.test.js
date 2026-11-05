import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gatewayProfile,startGateway} from '../lib/gateway.js';

test('compiled gateway forwards original request with Chinese preference', {skip:!process.env.SCIENCE_GATEWAY_TEST,timeout:20000},async()=>{
 let received;
 const upstream=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  received={body:JSON.parse(body),key:req.headers['x-api-key']};
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({id:'msg_fixture',type:'message',role:'assistant',model:'fixture-model',content:[{type:'text',text:'测试成功'}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}));
 });
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 let gateway;
 try{
  const profile=gatewayProfile({protocol:'anthropic',baseUrl:`http://127.0.0.1:${upstream.address().port}`,model:'fixture-model',key:'fixture-key',contractDigest:createHash('sha256').update(await readFile(new URL('../backend-source/catalog/provider-contracts.v1.json',import.meta.url))).digest('hex')});
  gateway=await startGateway({binary:process.env.SCIENCE_GATEWAY_TEST,profile,timeoutMs:10000});
  const messages=[{role:'user',content:'Ask me to choose a research method.'}];
  const response=await fetch(`${gateway.baseUrl}/v1/messages`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:profile.catalog.default_selector_id,system:'Original task instructions',messages,max_tokens:100})});
  assert.equal(response.status,200);
  await response.json();
  assert.match(JSON.stringify(received.body.system),/Original task instructions/);
  assert.match(JSON.stringify(received.body.system),/简体中文/);
  assert.match(JSON.stringify(received.body.system),/选择题/);
  assert.deepEqual(received.body.messages,messages);
  assert.equal(received.key,'fixture-key');
 }finally{
  if(gateway){const exited=once(gateway.child,'exit');gateway.stop();await exited;}
  await new Promise(resolve=>upstream.close(resolve));
 }
});
