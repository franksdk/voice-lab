'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionUpdate } from '@/lib/scenarios';
import { appPath } from '@/lib/base-path';

export type Transcript = { id: string; role: 'user' | 'assistant'; text: string };
type Status = 'idle' | 'connecting' | 'live' | 'ended' | 'error';
export function useVoice() {
  const [status, setStatus] = useState<Status>('idle');
  const [activity, setActivity] = useState('等待开始');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [messages, setMessages] = useState<Transcript[]>([]);
  const [level, setLevel] = useState(0);
  const meter = useRef<{ctx?:AudioContext;frame?:number}>({});
  const [playBlocked, setPlayBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resources = useRef<{ pc?: RTCPeerConnection; stream?: MediaStream; abort?: AbortController; timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval>; disconnectTimer?: ReturnType<typeof setTimeout>; channels: Set<RTCDataChannel>; epoch: number; busy: boolean }>({ channels: new Set(), epoch: 0, busy: false });
  const cleanup = useCallback(() => {
    const r = resources.current;
    r.epoch++;
    cancelAnimationFrame(meter.current.frame || 0); void meter.current.ctx?.close(); meter.current.ctx=undefined; setLevel(0);
    r.busy = false;
    clearTimeout(r.timeout); clearTimeout(r.disconnectTimer); clearInterval(r.interval);
    r.abort?.abort();
    r.stream?.getTracks().forEach(t => t.stop());
    for (const channel of r.channels) { channel.onmessage = null; channel.onopen = null; channel.close(); }
    r.channels.clear();
    if (r.pc) { r.pc.onconnectionstatechange = null; r.pc.ondatachannel = null; r.pc.ontrack = null; r.pc.close(); }
    r.pc = undefined; r.stream = undefined;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null; }
  }, []);
  const end = useCallback(() => { cleanup(); setStatus('ended'); setActivity('通话已结束'); setMuted(false); setPlayBlocked(false); }, [cleanup]);
  useEffect(() => {
    const leave = () => cleanup();
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); cleanup(); };
  }, [cleanup]);
  const start = async (scenarioId: string, notes: string, voice: string, language = 'zh', code = '') => {
    if (resources.current.busy) return;
    cleanup();
    const r = resources.current;
    r.busy = true;
    const epoch = r.epoch;
    const current = () => r.epoch === epoch;
    r.abort = new AbortController();
    setStatus('connecting'); setActivity('正在连接'); setError(''); setMuted(false); setMessages([]); setSeconds(0); setPlayBlocked(false);
    const fail = (message: string) => { if (!current()) return; cleanup(); setStatus('error'); setActivity('连接已停止'); setError(message); };
    r.timeout = setTimeout(() => fail('连接等待超过 40 秒。请检查网络和麦克风权限后重试。'), 40000);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('请使用 HTTPS 或 localhost，并在支持麦克风的浏览器打开。');
      const configResponse = await fetch(appPath('/api/config'), { signal: r.abort.signal });
      if (!configResponse.ok) throw new Error('无法读取语音配置，请稍后重试。');
      const config = await configResponse.json() as { ready: boolean; model: string };
      if (!config.ready) throw new Error('语音服务尚未配置。请先由管理员配置百炼账号。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!current()) { stream.getTracks().forEach(t => t.stop()); return; }
      r.stream = stream;
      const ctx=new AudioContext();meter.current.ctx=ctx;const analyser=ctx.createAnalyser();analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);const values=new Uint8Array(128);
      const tick=()=>{if(!current())return;analyser.getByteTimeDomainData(values);let sum=0;for(const n of values)sum+=(n-128)**2;setLevel(Math.min(1,Math.sqrt(sum/values.length)/25));meter.current.frame=requestAnimationFrame(tick);};tick();
      stream.getAudioTracks().forEach(t => { t.enabled = false; });
      const pc = new RTCPeerConnection({ iceServers: [] });
      r.pc = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = event => {
        if (!current() || !audioRef.current) return;
        audioRef.current.srcObject = event.streams[0] || new MediaStream([event.track]);
        ctx.createMediaStreamSource(audioRef.current.srcObject as MediaStream).connect(analyser);
        audioRef.current.play().catch(() => { if (current()) setPlayBlocked(true); });
      };
      pc.onconnectionstatechange = () => {
        if (!current()) return;
        if (pc.connectionState === 'failed') fail('语音连接失败，请检查网络后重新开始。');
        if (pc.connectionState === 'disconnected') {
          setActivity('网络暂时中断');
          clearTimeout(r.disconnectTimer);
          r.disconnectTimer = setTimeout(() => fail('网络连接已中断，请重新开始。'), 8000);
        }
        if (pc.connectionState === 'connected') clearTimeout(r.disconnectTimer);
      };
      const seen = new Set<string>();
      let configured = false;
      let ready = false;
      let responseId = '';
      const upsert = (id: string, role: Transcript['role'], text: string, append: boolean) => setMessages(previous => {
        const existing = previous.find(m => m.id === id);
        if (!existing) return [...previous, { id, role, text }];
        return previous.map(m => m.id === id ? { ...m, text: append ? m.text + text : text } : m);
      });
      const attach = (channel: RTCDataChannel) => {
        r.channels.add(channel);
        channel.onmessage = event => {
          if (!current()) return;
          let data;
          try { data = JSON.parse(event.data); } catch { return; }
          if (data.event_id && seen.has(data.event_id)) return;
          if (data.event_id) seen.add(data.event_id);
          // Aliyun can send events through its own "txt" channel. Configure on
          // session.created on that channel, not on the browser channel opening.
          if (data.type === 'session.created' && !configured) {
            configured = true;
            channel.send(JSON.stringify(sessionUpdate(scenarioId, notes, voice, config.model, 'webrtc', language)));
          }
          if (data.type === 'session.updated' && !ready) {
            ready = true; clearTimeout(r.timeout);
            stream.getAudioTracks().forEach(t => { t.enabled = true; });
            setStatus('live'); setActivity('请说“你好”，开始对话');
            const began = Date.now();
            r.interval = setInterval(() => {
              const elapsed = Math.floor((Date.now() - began) / 1000); setSeconds(elapsed);
              if (elapsed >= 300) { end(); setError('本次 5 分钟体验已结束，可以重新开始。'); }
            }, 1000);
          }
          if (data.type === 'error') { fail('模型处理失败，请检查账号权限和会话参数后重试。'); return; }
          if (data.type === 'input_audio_buffer.speech_started') setActivity('正在听你说');
          if (data.type === 'input_audio_buffer.speech_stopped') setActivity('正在组织回答');
          if (data.type === 'response.created') responseId = data.response?.id || crypto.randomUUID();
          if (data.type === 'response.text.delta' || data.type === 'response.audio_transcript.delta') {
            setActivity('AI 正在回答');
            upsert(data.item_id || data.response_id || responseId || 'assistant', 'assistant', data.delta || '', true);
          }
          if (data.type === 'response.text.done' || data.type === 'response.audio_transcript.done') upsert(data.item_id || data.response_id || responseId || 'assistant', 'assistant', data.text || data.transcript || '', false);
          if (data.type === 'conversation.item.input_audio_transcription.completed') upsert(data.item_id || crypto.randomUUID(), 'user', data.transcript || '', false);
          if (data.type === 'conversation.item.input_audio_transcription.failed') setError('本轮语音转文字失败，语音对话可继续。');
          if (data.type === 'response.done') {
            if (data.response?.status === 'failed') { fail('本轮回答失败，请检查模型额度后重试。'); return; }
            setActivity('回答已生成，可继续说话');
          }
        };
      };
      attach(pc.createDataChannel('oai-events'));
      pc.ondatachannel = event => attach(event.channel);
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve, reject) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const signal = r.abort!.signal;
        const timer = setTimeout(() => finish(new Error('无法完成音频网络协商，请更换网络后重试。')), 10000);
        const changed = () => { if (pc.iceGatheringState === 'complete') finish(); };
        const aborted = () => finish(new Error('连接已取消'));
        const finish = (error?: Error) => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
        pc.addEventListener('icegatheringstatechange', changed); signal.addEventListener('abort', aborted, { once: true });
      });
      if (!current()) return;
      const response = await fetch(appPath('/api/session'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Code': code }, body: JSON.stringify({ sdp: pc.localDescription?.sdp }), signal: r.abort.signal });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || '无法建立语音会话。'); }
      const answer = await response.text();
      if (current()) await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    } catch (e) {
      const err = e as Error;
      fail(err.name === 'NotAllowedError' ? '麦克风权限未开启。请在地址栏允许麦克风，然后重试。' : err.name === 'NotFoundError' ? '没有找到麦克风，请连接设备后重试。' : err.name === 'NotReadableError' ? '麦克风被其他应用占用，请关闭占用它的应用后重试。' : err.message);
    }
  };
  const toggleMute = () => {
    const next = !muted;
    resources.current.stream?.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };
  const resumeAudio = async () => { try { await audioRef.current?.play(); setPlayBlocked(false); } catch { setError('浏览器未能播放声音，请检查输出设备。'); } };
  return { level, status, activity, error, muted, seconds, messages, playBlocked, audioRef, start, end, toggleMute, resumeAudio };
}
