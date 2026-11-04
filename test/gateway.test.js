import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayProfile } from '../lib/gateway.js';
const config={protocol:'anthropic',baseUrl:'https://example.com/v1',model:'test-model',key:'fixture-key',contractDigest:'1'.repeat(64)};
test('model routing profile is stable and selects the correct gateway protocol',()=>{
  const first=gatewayProfile(config), second=gatewayProfile(config);
  assert.equal(first.adapter,'relay');
  assert.equal(first.contractId,'custom-anthropic');
  assert.equal(first.catalog.catalog_fp,second.catalog.catalog_fp);
  assert.equal(first.catalog.routes[0].upstream_model,'test-model');
  assert.throws(()=>gatewayProfile({...config,protocol:'openai-chat'}));
});
test('provider settings reject unsafe endpoints and invalid values',()=>{
  for(const baseUrl of ['http://example.com','https://user:pass@example.com','https://example.com/?key=secret','file:///tmp/x']) assert.throws(()=>gatewayProfile({...config,baseUrl}));
  assert.throws(()=>gatewayProfile({...config,key:'x\ny'}));
  assert.throws(()=>gatewayProfile({...config,model:'x'.repeat(257)}));
  assert.throws(()=>gatewayProfile({...config,contractDigest:'wrong'}));
  assert.doesNotThrow(()=>gatewayProfile({...config,baseUrl:'http://127.0.0.1:1234'}));
});
