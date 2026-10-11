import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmToWav, previewSelection } from '../selfhost/preview.mjs';

test('preview accepts every published system language and voice combination', () => {
  assert.deepEqual(previewSelection('aliyun', 'fr', 'longanlingxin'), { provider: 'aliyun', language: 'fr', voice: 'longanlingxin' });
  assert.deepEqual(previewSelection('doubao', 'en', 'en_female_dacey_uranus_bigtts'), { provider: 'doubao', language: 'en', voice: 'en_female_dacey_uranus_bigtts' });
  assert.deepEqual(previewSelection('doubao', 'sichuan', 'zh_male_yunzhou_jupiter_bigtts'), { provider: 'doubao', language: 'sichuan', voice: 'zh_male_yunzhou_jupiter_bigtts' });
});

test('preview rejects unknown and language-incompatible options', () => {
  assert.throws(() => previewSelection('other', 'zh', 'longanqian'), /模型/);
  assert.throws(() => previewSelection('aliyun', 'unknown', 'longanqian'), /语言/);
  assert.throws(() => previewSelection('doubao', 'zh', 'en_male_tim_uranus_bigtts'), /音色/);
  assert.throws(() => previewSelection('doubao', 'en', 'zh_female_vv_jupiter_bigtts'), /音色/);
});

test('PCM preview is wrapped as a playable 24 kHz mono WAV', () => {
  const wav = pcmToWav(Buffer.from([1, 2, 3, 4]));
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 4);
  assert.deepEqual([...wav.subarray(44)], [1, 2, 3, 4]);
});
