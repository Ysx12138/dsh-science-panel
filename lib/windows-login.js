// Local sandbox credential format follows CSSwitch (MIT); see third-party/CSSwitch-LICENSE.
import {randomBytes,randomUUID,hkdfSync,createCipheriv,createDecipheriv} from 'node:crypto';
export function encryptLocalToken(token,key){
 const derived=hkdfSync('sha256',Buffer.from(key,'base64'),Buffer.alloc(0),'operon:aes-256-gcm:oauth',32);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',derived,iv);
 cipher.setAAD(Buffer.from('v2:oauth'));
 return 'v2:'+Buffer.concat([iv,cipher.update(JSON.stringify(token)),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
export function decryptLocalToken(text,key){
 if(!text.startsWith('v2:'))throw new Error('本地登录格式无效');
 const raw=Buffer.from(text.slice(3),'base64');if(raw.length<28)throw new Error('本地登录格式无效');
 const derived=hkdfSync('sha256',Buffer.from(key,'base64'),Buffer.alloc(0),'operon:aes-256-gcm:oauth',32);
 const decipher=createDecipheriv('aes-256-gcm',derived,raw.subarray(0,12));
 decipher.setAAD(Buffer.from('v2:oauth'));decipher.setAuthTag(raw.subarray(-16));
 return JSON.parse(Buffer.concat([decipher.update(raw.subarray(12,-16)),decipher.final()]).toString('utf8'));
}
export function createLocalLogin(){
 const keys=Object.fromEntries(['ANTHROPIC_API_KEY_ENCRYPTION_KEY','OAUTH_ENCRYPTION_KEY','JWT_SIGNING_SECRET','USER_SECRET_ENCRYPTION_KEY'].map(name=>[name,randomBytes(32).toString('base64')]));
 const account=randomUUID(),org=randomUUID();
 const token={access_token:'sk-ant-virtual-'+randomBytes(24).toString('hex'),refresh_token:'',api_key:null,token_expires_at:'2099-01-01T00:00:00.000Z',provider:'claude_ai',scopes:'user:inference user:file_upload user:profile user:mcp_servers user:plugins',email:'virtual@localhost.invalid',account_uuid:account,subscription_type:'max',rate_limit_tier:null,seat_tier:null,org_uuid:org,billing_type:null,has_extra_usage_enabled:false};
 return {account,org,keyFile:Object.entries(keys).map(([name,value])=>`${name}=${value}`).join('\n')+'\n',encryptedToken:encryptLocalToken(token,keys.OAUTH_ENCRYPTION_KEY)};
}
