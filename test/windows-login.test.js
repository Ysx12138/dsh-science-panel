import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalLogin,decryptLocalToken,encryptLocalToken} from '../lib/windows-login.js';
test('isolated local token authenticates ciphertext and keeps a local identity',()=>{
 const login=createLocalLogin();const key=login.keyFile.match(/^OAUTH_ENCRYPTION_KEY=(.+)$/m)[1];
 const token=decryptLocalToken(login.encryptedToken,key);
 assert.equal(token.org_uuid,login.org);assert.equal(token.account_uuid,login.account);
 assert.equal(token.email,'virtual@localhost.invalid');
 assert.throws(()=>decryptLocalToken(login.encryptedToken,Buffer.alloc(32).toString('base64')));
 const raw=Buffer.from(login.encryptedToken.slice(3),'base64');raw[12]^=1;
 assert.throws(()=>decryptLocalToken('v2:'+raw.toString('base64'),key));
 assert.notEqual(encryptLocalToken(token,key),login.encryptedToken);
});
