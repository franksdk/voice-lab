import test from 'node:test';
import assert from 'node:assert/strict';
import { publicConfig } from '../lib/session.ts';
import { sessionUpdate } from '../lib/scenarios.ts';
test('new deployment defaults to Audio 3.0 Flash and accepts configured credentials', () => {
  assert.equal(publicConfig({}).model, 'qwen-audio-3.0-realtime-flash');
  assert.equal(publicConfig({DASHSCOPE_API_KEY:'test',DASHSCOPE_WORKSPACE_ID:'test',DASHSCOPE_MODEL:'qwen-audio-3.0-realtime-plus'}).ready, true);
});
test('Audio 3.0 uses its own supported voice and smart_turn contract', () => {
  const session = sessionUpdate('software', '', 'longanlingxin', 'qwen-audio-3.0-realtime-flash').session;
  assert.equal(session.voice, 'longanlingxin');
  assert.deepEqual(session.turn_detection, {type:'smart_turn'});
  assert.equal(sessionUpdate('software', '', 'Tina', 'qwen-audio-3.0-realtime-flash').session.voice, 'longanqian');
});
test('Omni compatibility retains its model-specific voice and VAD settings', () => {
  const session = sessionUpdate('software', '', 'Ethan', 'qwen3.5-omni-flash-realtime').session;
  assert.equal(session.voice, 'Ethan');
  assert.equal(session.turn_detection.type, 'semantic_vad');
});

test('WebRTC does not modify turn detection after audio transport starts',()=>{
 const s=sessionUpdate('software','产品仅提供跟进提醒','longanqian','qwen-audio-3.0-realtime-flash','webrtc').session;
 assert.equal(Object.hasOwn(s,'turn_detection'),false);
 assert.ok(s.instructions.includes('产品仅提供跟进提醒'));
 assert.equal(s.voice,'longanqian');
});

test('account-owned cloned voice ids are accepted for their matching realtime provider', () => {
  const aliyun = 'qwen-audio-3.0-realtime-flash-u123-voice';
  assert.equal(sessionUpdate('software', '', aliyun, 'qwen-audio-3.0-realtime-flash', 'webrtc').session.voice, aliyun);
});

test('Audio 3.0 exposes every documented system voice and applies the selected language', () => {
  for (const voice of ['longanqian','longanlingxin','longanlingxi','longanxiaoxin','longanlufeng']) {
    assert.equal(sessionUpdate('software', '', voice, 'qwen-audio-3.0-realtime-flash', 'webrtc', 'ja').session.voice, voice);
  }
  assert.match(sessionUpdate('software', '', 'longanqian', 'qwen-audio-3.0-realtime-flash', 'webrtc', 'ja').session.instructions, /全程使用日语/);
});
