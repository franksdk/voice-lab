import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import WebSocket from 'ws';
import {attachDoubao} from '../selfhost/doubao.mjs';
test('real upgrade rejects missing gateway and foreign origin before contacting provider',async()=>{
 const server=createServer();attachDoubao(server,{PUBLIC_ORIGIN:'https://demo.example',INTERNAL_GATEWAY_TOKEN:'secret'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const headers of [{Origin:'https://demo.example'},{Origin:'https://foreign.example','X-Voice-Gateway':'secret'}]){
  const status=await new Promise((resolve,reject)=>{const w=new WebSocket(`ws://127.0.0.1:${server.address().port}/voice-lab/api/doubao`,{headers});w.on('unexpected-response',(_,r)=>{r.resume();w.terminate();resolve(r.statusCode);});w.on('error',()=>{});w.on('open',()=>{w.close();reject(Error('Unexpected access'));});});assert.equal(status,403);
 }}finally{await new Promise(r=>server.close(r));}
});
