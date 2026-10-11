import test from 'node:test';
import assert from 'node:assert/strict';
import {encode,decode,authorized} from '../selfhost/doubao-protocol.mjs';
import {buildDoubaoConfig} from '../selfhost/doubao.mjs';
test('connection packet follows vendor wire fixture',()=>{assert.equal(encode(1,{}).toString('hex'),'1114100000000001000000027b7d');});
test('audio response preserves bytes and session id',()=>{const b=Buffer.from('11b40000000001600000000178000000020102','hex');const r=decode(b);assert.equal(r.event,352);assert.equal(r.session,'x');assert.deepEqual([...r.payload],[1,2]);});
test('truncated provider payload is rejected',()=>{assert.throws(()=>decode(Buffer.from('11b40000000001600000000178','hex')));});
test('websocket gate rejects cross site and missing secret',()=>{const env={PUBLIC_ORIGIN:'https://demo.example',INTERNAL_GATEWAY_TOKEN:'secret'};assert.equal(authorized({'origin':'https://evil.example','x-voice-gateway':'secret'},env),false);assert.equal(authorized({'origin':env.PUBLIC_ORIGIN},env),false);assert.equal(authorized({'origin':env.PUBLIC_ORIGIN,'x-voice-gateway':'secret'},env),true);});
test('O2.0 accepts all documented Chinese and English voices and applies dialects',()=>{
 const english=buildDoubaoConfig({scenario:'software',notes:'',voice:'en_female_dacey_uranus_bigtts',language:'en'});
 assert.equal(english.tts.speaker,'en_female_dacey_uranus_bigtts');
 assert.match(english.dialog.system_role,/全程使用英语/);
 const dialect=buildDoubaoConfig({scenario:'software',notes:'',voice:'zh_male_yunzhou_jupiter_bigtts',language:'sichuan'});
 assert.equal(dialect.tts.extra.explicit_dialect,'sichuan');
});
