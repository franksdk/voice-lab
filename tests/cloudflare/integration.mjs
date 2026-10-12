import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.CLOUDFLARE_TEST_ORIGIN || 'http://localhost:8787';
const password = /^VOICE_PASSWORD=(.+)$/m.exec(readFileSync('.dev.vars','utf8'))?.[1];
assert.ok(password, 'Set a test VOICE_PASSWORD in .dev.vars');
const authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
const request = (path, options = {}) => fetch(base+path, { ...options, headers: { authorization, ...options.headers } });
let count = 0;
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); count++; };
await check('unauthenticated page requires login', async () => assert.equal((await fetch(base+'/voice-lab/')).status,401));
await check('authenticated pages and static assets load',async()=>{
 const response=await request('/voice-lab/');assert.equal(response.status,200);const html=await response.text();
 const assets=[...html.matchAll(/(?:src|href)="(\/voice-lab\/assets\/[^\"]+)"/g)];assert.ok(assets.length>=2);
 for(const [,path]of assets)assert.equal((await request(path)).status,200);
 assert.equal((await request('/voice-lab/phone/')).status,200);
});
await check('configuration does not expose secrets',async()=>{const response=await request('/voice-lab/api/config');assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes(password));assert.equal(JSON.parse(text).ready,false);});
await check('forged account headers cannot change identity',async()=>{const account=await(await request('/voice-lab/api/account',{headers:{'x-voice-user':'attacker'}})).json();assert.equal(account.user,'admin');});
await check('cross-origin memory writes rejected',async()=>{assert.equal((await request('/voice-lab/api/memory',{method:'PUT',headers:{origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify({memory:'wrong'})})).status,403);});
await check('memory saved in durable storage',async()=>{
 const memory='Cloudflare persistence check 中文 English';
 assert.equal((await request('/voice-lab/api/memory',{method:'PUT',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({memory})})).status,200);
 assert.equal((await(await request('/voice-lab/api/account')).json()).memory,memory);
});
await check('large conversation history is stored across chunks',async()=>{
 for(let i=0;i<10;i++){
 const messages=Array.from({length:20},()=>({role:'user',text:'测'.repeat(350)}));
 const response=await request('/voice-lab/api/conversations',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({messages})});assert.equal(response.status,200);
 }
 const account=await(await request('/voice-lab/api/account')).json();assert.equal(account.recentConversationCount,10);assert.ok(account.context.includes('测'));
});
await check('unconfigured paid providers are disabled',async()=>{
 const options={method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({sdp:'v=0\nm=audio'})};
 assert.equal((await request('/voice-lab/api/session',options)).status,503);
 const preview=await request('/voice-lab/api/preview',{...options,body:JSON.stringify({provider:'aliyun',language:'zh',voice:'longanqian'})});assert.equal(preview.status,503);
});
await check('unknown samples cannot bypass protection',async()=>assert.equal((await fetch(base+'/voice-lab/api/voice-samples/'+'0'.repeat(64))).status,404));
console.log(`${count} Cloudflare integration checks passed`);
