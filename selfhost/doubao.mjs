import WebSocket,{WebSocketServer} from 'ws';
import {randomUUID} from 'node:crypto';
import {encode,decode,authorized} from './doubao-protocol.mjs';
import {sessionUpdate} from '../lib/scenarios.ts';
const doubaoVoices=['zh_female_vv_jupiter_bigtts','zh_female_xiaohe_jupiter_bigtts','zh_male_yunzhou_jupiter_bigtts','zh_male_xiaotian_jupiter_bigtts','en_male_tim_uranus_bigtts','en_female_dacey_uranus_bigtts','en_female_stokie_uranus_bigtts'];
const dialects=['dongbei','sichuan','shaanxi','yue','beijing','henan','tianjin','shanghai'];
export function buildDoubaoConfig(p){
 const voice=doubaoVoices.includes(p.voice)?p.voice:'zh_female_vv_jupiter_bigtts';
 const dialect=dialects.includes(p.language)&&voice.startsWith('zh_')?p.language:undefined;
 return {asr:{extra:{}},tts:{extra:dialect?{explicit_dialect:dialect}:{},speaker:voice,audio_config:{channel:1,format:'pcm_s16le',sample_rate:24000}},dialog:{bot_name:'小树',system_role:sessionUpdate(p.scenario,p.notes,'','qwen-audio-3.0-realtime-flash','websocket',p.language).session.instructions,extra:{model:'1.2.1.1',input_mod:'keep_alive'}}};
}
export function attachDoubao(server,env){
 const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
 let count=0;
 server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/voice-lab/api/doubao'||!authorized(req.headers,env)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  if(!env.VOLCENGINE_APP_ID||!env.VOLCENGINE_ACCESS_KEY||count>=4){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,client=>{
   count++;let upstream,ready=false,started=false,closing=false,bytes=0;const sid=randomUUID();
   const send=x=>{if(client.readyState===1)client.send(JSON.stringify(x));};
   const finish=()=>{if(closing)return;closing=true;clearTimeout(timeout);clearTimeout(limit);clearInterval(rate);if(upstream?.readyState===1){if(started)upstream.send(encode(102,{},sid));else upstream.close();}else upstream?.terminate();setTimeout(()=>upstream?.terminate(),2000).unref();};
   const fail=message=>{send({error:message});finish();client.close(1011);};
   const timeout=setTimeout(()=>fail('豆包连接超时，请稍后重试。'),20000);
   const limit=setTimeout(()=>{send({ended:true});finish();client.close(1000);},300000);
   const rate=setInterval(()=>{bytes=0;},1000);
   client.on('error',finish);client.on('close',()=>{count--;finish();});
   client.on('message',(raw,binary)=>{
    if(closing)return;
    if(binary){bytes+=raw.length;if(raw.length%2||bytes>96000)return fail('音频发送过快，请重新连接。');if(ready&&upstream?.readyState===1){if(upstream.bufferedAmount>128000)return fail('上传网络拥堵，请重试。');upstream.send(encode(200,raw,sid));}return;}
    if(upstream)return fail('连接参数重复。');
    let p;try{p=JSON.parse(raw.toString());}catch{return fail('连接参数无效。');}
    if(typeof p.scenario!=='string'||typeof p.notes!=='string'||p.notes.length>1500)return fail('对话设置无效。');
    const config=buildDoubaoConfig(p);
    upstream=new WebSocket('wss://openspeech.bytedance.com/api/v3/realtime/dialogue',{headers:{'X-Api-App-ID':env.VOLCENGINE_APP_ID,'X-Api-Access-Key':env.VOLCENGINE_ACCESS_KEY,'X-Api-Resource-Id':'volc.speech.dialog','X-Api-App-Key':'PlgvMymc7f3tQnJ6','X-Api-Connect-Id':randomUUID()},handshakeTimeout:12000,maxPayload:1048576,perMessageDeflate:false});
    upstream.on('open',()=>upstream.send(encode(1,{})));
    upstream.on('error',()=>{if(!closing)fail('豆包连接失败，请检查语音服务权限与额度。');});
    upstream.on('close',()=>{if(!closing)fail('豆包连接已断开，请重新开始。');});
    upstream.on('message',b=>{try{
     const msg=decode(b);
     if(msg.event===152){upstream.send(encode(2,{}));upstream.close();return;}
     if(closing)return;
     if(msg.code||[51,153,599].includes(msg.event)){console.warn('Doubao event failed',msg.event,msg.code,msg.data?.status_code);return fail('豆包处理失败，请检查额度、权限或稍后重试。');}
     if(msg.event===50){started=true;upstream.send(encode(100,config,sid));}
     if(msg.event===150){ready=true;clearTimeout(timeout);send({ready:true});}
     if(msg.event===352){if(client.bufferedAmount>1048576)return fail('播放网络拥堵，请重新开始。');if(client.readyState===1)client.send(msg.payload);}
     else if([450,451,459,550,559,359].includes(msg.event))send({event:msg.event,data:msg.data});
    }catch{fail('豆包返回的音频数据无法处理，请重试。');}});
   });
  });
 });
}
