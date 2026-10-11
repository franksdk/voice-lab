import {timingSafeEqual} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const int=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
export function encode(event,payload,session='') {
 const audio=Buffer.isBuffer(payload),p=audio?payload:Buffer.from(JSON.stringify(payload));
 return Buffer.concat([Buffer.from([0x11,audio?0x24:0x14,audio?0:0x10,0]),int(event),...(session?[int(Buffer.byteLength(session)),Buffer.from(session)]:[]),int(p.length),p]);
}
export function decode(b){
 if(b.length<4||b[0]!==0x11)throw Error('Invalid header');
 const type=b[1]>>4,flags=b[1]&15;let pos=4;
 const num=()=>{if(pos+4>b.length)throw Error('Truncated');const n=b.readUInt32BE(pos);pos+=4;return n;};
 const bytes=()=>{const n=num();if(pos+n>b.length)throw Error('Truncated');const s=b.subarray(pos,pos+n);pos+=n;return s;};
 let code,event,session='';
 if(type===15)code=num();
 if(flags&1)num();
 if(flags&4){event=num();session=bytes().toString();}
 let payload=bytes();if((b[2]&15)===1)payload=gunzipSync(payload,{maxOutputLength:1048576});
 return {event,code,session,payload,data:(b[2]>>4)===1?JSON.parse(payload.toString()):null};
}
export function authorized(headers,env){
 const a=Buffer.from(headers['x-voice-gateway']||''),b=Buffer.from(env.INTERNAL_GATEWAY_TOKEN||'');
 return b.length>0&&a.length===b.length&&timingSafeEqual(a,b)&&headers.origin===env.PUBLIC_ORIGIN;
}
