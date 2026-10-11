'use client';
import {useRef,useState,useEffect} from 'react';
import {appPath} from '@/lib/base-path';
import type {Transcript} from './use-voice';
export function useDoubao(){
 const [status,setStatus]=useState<'idle'|'connecting'|'live'|'ended'|'error'>('idle');
 const [activity,setActivity]=useState('等待开始'),[error,setError]=useState(''),[muted,setMuted]=useState(false),[seconds,setSeconds]=useState(0),[messages,setMessages]=useState<Transcript[]>([]),[level,setLevel]=useState(0);
 const audioRef=useRef<HTMLAudioElement>(null);
 const r=useRef<{epoch:number;busy:boolean;ws?:WebSocket;ctx?:AudioContext;stream?:MediaStream;node?:AudioWorkletNode;timer?:ReturnType<typeof setInterval>;timeout?:ReturnType<typeof setTimeout>;sources:Set<AudioBufferSourceNode>;next:number}>({epoch:0,busy:false,sources:new Set(),next:0});
 const stopAudio=()=>{for(const s of r.current.sources){try{s.stop();}catch{}}r.current.sources.clear();r.current.next=0;setLevel(0);};
 const cleanup=()=>{const x=r.current;x.epoch++;x.busy=false;clearInterval(x.timer);clearTimeout(x.timeout);if(x.ws){x.ws.onclose=null;x.ws.onerror=null;x.ws.onmessage=null;x.ws.close();}x.node?.disconnect();x.stream?.getTracks().forEach(t=>t.stop());stopAudio();void x.ctx?.close();x.ctx=undefined;};
 const end=()=>{cleanup();setStatus('ended');setActivity('通话已结束');setMuted(false);};
 useEffect(()=>{const leave=()=>cleanup();window.addEventListener('pagehide',leave);return()=>{window.removeEventListener('pagehide',leave);cleanup();};},[]);
 const start=async(scenario:string,notes:string,voice:string,language='zh',_code='')=>{
  if(r.current.busy)return;cleanup();const x=r.current;x.busy=true;const epoch=x.epoch,current=()=>x.epoch===epoch;
  const fail=(s:string)=>{if(!current())return;cleanup();setStatus('error');setError(s);setActivity('连接已停止');};
  setStatus('connecting');setActivity('正在连接豆包');setError('');setMessages([]);setSeconds(0);setMuted(false);
  x.timeout=setTimeout(()=>fail('连接超时，请检查麦克风权限后重试。'),30000);
  try{
   const ctx=new AudioContext();x.ctx=ctx;await ctx.resume();
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(!current()){stream.getTracks().forEach(t=>t.stop());return;}x.stream=stream;
   await ctx.audioWorklet.addModule(appPath('/capture.js'));if(!current())return;
   const node=new AudioWorkletNode(ctx,'voice-capture');x.node=node;
   const input=ctx.createMediaStreamSource(stream),silent=ctx.createGain();silent.gain.value=0;input.connect(node);node.connect(silent);silent.connect(ctx.destination);
   const url=new URL(appPath('/api/doubao'),location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
   const ws=new WebSocket(url);x.ws=ws;ws.binaryType='arraybuffer';let ready=false,userId='';
   const upsert=(id:string,role:Transcript['role'],text:string,append=false)=>setMessages(old=>old.some(m=>m.id===id)?old.map(m=>m.id===id?{...m,text:append?m.text+text:text}:m):[...old,{id,role,text}]);
   node.port.onmessage=e=>{if(!current()||!ready||ws.readyState!==1)return;if(ws.bufferedAmount>128000){fail('上传网络拥堵，请重新开始。');return;}ws.send(e.data);if(!x.sources.size){const a=new Int16Array(e.data);let sum=0;for(const v of a)sum+=v*v;setLevel(Math.min(1,Math.sqrt(sum/a.length)/5000));}};
   ws.onopen=()=>{if(current())ws.send(JSON.stringify({scenario,notes,voice,language}));};ws.onerror=()=>fail('无法连接豆包，请检查网络或重新登录。');ws.onclose=()=>fail('语音连接已断开，请重新开始。');
   ws.onmessage=e=>{if(!current())return;
    if(e.data instanceof ArrayBuffer){const pcm=new Int16Array(e.data);const b=ctx.createBuffer(1,pcm.length,24000);const d=b.getChannelData(0);let sum=0;for(let i=0;i<pcm.length;i++){d[i]=pcm[i]/32768;sum+=d[i]*d[i];}const source=ctx.createBufferSource();source.buffer=b;source.connect(ctx.destination);const at=Math.max(ctx.currentTime+.03,x.next);if(at-ctx.currentTime>12){fail('音频播放积压，请重试。');return;}x.next=at+b.duration;x.sources.add(source);source.onended=()=>{x.sources.delete(source);if(!x.sources.size)setLevel(0);};source.start(at);setLevel(Math.min(1,Math.sqrt(sum/pcm.length)*5));setActivity('AI 正在回答');return;}
    let p;try{p=JSON.parse(e.data);}catch{return;}if(p.error){fail(p.error);return;}if(p.ended){end();return;}
    if(p.ready){ready=true;clearTimeout(x.timeout);setStatus('live');setActivity('请说“你好”，开始对话');const began=Date.now();x.timer=setInterval(()=>{const s=Math.floor((Date.now()-began)/1000);setSeconds(s);if(s>=300)end();},1000);}
    if(p.event===450){stopAudio();userId=p.data?.question_id||crypto.randomUUID();setActivity('正在听你说');}
    if(p.event===451){const text=(p.data?.results||[]).map((a:{text:string})=>a.text).join('');upsert(userId||'user','user',text);}
    if(p.event===459)setActivity('正在组织回答');
    if(p.event===550)upsert(p.data.reply_id||'assistant','assistant',p.data.content||'',true);
   };
  }catch(e){const er=e as Error;fail(er.name==='NotAllowedError'?'请在地址栏允许使用麦克风后重试。':er.name==='NotFoundError'?'没有找到麦克风，请连接设备。':'音频启动失败，请检查设备或刷新页面。');}
 };
 return {status,activity,error,muted,seconds,messages,level,audioRef,start,end,toggleMute:()=>{const next=!muted;r.current.stream?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next);},playBlocked:false,resumeAudio:async()=>{await r.current.ctx?.resume();}};
}
