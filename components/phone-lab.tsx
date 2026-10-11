'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, AudioLines, Check, Clipboard, Phone, Save } from 'lucide-react';
import StudioNav from './studio-nav';
import { appPath } from '@/lib/base-path';
import '../app/redesign.css';
import '../app/phone.css';

const storageKey = 'zhishu-aliyun-phone-draft-v1';
const initialDraft = {
  name: '小树', direction: 'inbound', region: '', instanceId: '', robotId: '', phoneNumber: '',
  greeting: '您好，我是小树，您的 AI 语音助手。请问有什么可以帮您？',
  instructions: '用自然、简洁的中文回答，每次只问一个问题。不确定时明确说明，必要时建议转人工。',
};
type Draft = typeof initialDraft;
export default function PhoneLab() {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saved, setSaved] = useState('');
  const [copied, setCopied] = useState('');
  const update = (key: keyof Draft, value: string) => { setDraft(d => ({ ...d, [key]: value })); setSaved('有未保存的修改'); };

  useEffect(() => {
    document.title = '电话 AI · 智树云联';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const value = JSON.parse(raw);
        const next = { ...initialDraft };
        for (const key of Object.keys(next) as Array<keyof Draft>) if (typeof value[key] === 'string') next[key] = value[key].slice(0, key === 'instructions' ? 2000 : key === 'greeting' ? 300 : ['instanceId','robotId'].includes(key) ? 100 : 40);
        if (!['inbound', 'outbound'].includes(next.direction)) next.direction = initialDraft.direction;
        setDraft(next); setSaved('已读取本机草稿');
      }
    } catch { setSaved('无法读取本机草稿，可重新填写并下载。'); }
  }, []);
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); setSaved('已保存到本浏览器，尚未应用到电话服务'); }
    catch { setSaved('浏览器无法保存，请使用下载配置草稿。'); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ version: 1, status: 'draft', ...draft }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'phone-ai-draft.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(`电话 AI 接入需求\n用途：${draft.direction === 'inbound' ? 'AI 接听来电' : 'AI 主动外呼'}\n服务：阿里云云联络中心／伶鹊\n实例地域：${draft.region || '待确认'}\n实例 ID：${draft.instanceId || '待创建'}\n机器人 ID：${draft.robotId || '待创建'}\n号码：${draft.phoneNumber || '待申请'}\n助手名称：${draft.name}\n开场白：${draft.greeting}\n回答要求：${draft.instructions}\n当前为配置草稿；尚未接入线路或应用到电话服务。`);
      setCopied('接入需求已复制');
    } catch { setCopied('无法访问剪贴板，请下载配置草稿。'); }
  }
  return <div className="studio">
    <a className="skip-link" href="#phone-settings">跳到电话助手设置</a>
    <StudioNav page="phone"/>
    <main className="studio-main phone-main">
      <div className="page-heading phone-heading"><div><p className="eyebrow">阿里云 / 伶鹊</p><h1>把 AI，接进电话里。</h1></div><p>先设定助手，再接入号码。<br/>配置草稿不会发起真实电话。</p></div>
      <div className="phone-statusbar"><span className="phone-state" role="status"><i/>阿里云待接入 · 当前为配置草稿</span><a href="https://ccc.console.aliyun.com/" target="_blank" rel="noreferrer">打开阿里云控制台 <ArrowRight size={14}/></a></div>
      <div className="phone-workspace">
        <section className="phone-settings" id="phone-settings" aria-labelledby="settings-title">
          <div className="phone-section-heading"><span>01 / 设定助手</span><h2 id="settings-title">准备一次自然的对话</h2><p>这些设置仅保存在当前浏览器，供后续接线使用。</p></div>
          <fieldset className="phone-direction"><legend>通话方式</legend><div>
            <button type="button" aria-pressed={draft.direction === 'inbound'} onClick={() => update('direction', 'inbound')}><Phone size={17}/><b>AI 接听来电</b><small>用户拨号，AI 接待</small></button>
            <button type="button" aria-pressed={draft.direction === 'outbound'} onClick={() => update('direction', 'outbound')}><ArrowRight size={17}/><b>AI 主动外呼</b><small>由平台发起电话</small></button>
          </div></fieldset>
          <div className="phone-service-choice"><span>已选服务</span><strong>阿里云云联络中心／伶鹊</strong><small>{draft.direction === 'inbound' ? 'AI 接听：数字员工 + 语音导航机器人' : 'AI 外呼：需另开智能外呼机器人及外呼线路'}</small></div>
          <label>助手名称<input maxLength={40} value={draft.name} onChange={e => update('name', e.target.value)}/></label>
          <label>开场白<textarea rows={3} maxLength={300} value={draft.greeting} onChange={e => update('greeting', e.target.value)}/></label>
          <label>回答要求与业务背景<textarea rows={4} maxLength={2000} value={draft.instructions} onChange={e => update('instructions', e.target.value)}/></label>
          <p className="phone-field-hint">这里的开场白与要求是草稿，后续需配置到阿里云机器人。请勿填写密钥或客户名单。</p>
          <details className="phone-resource-details"><summary>记录已创建的阿里云资源（选填）</summary><p>只记录资源标识，不会验证或绑定资源；未创建可以留空。</p><label>联络中心实例 ID<input maxLength={100} value={draft.instanceId} onChange={e => update('instanceId', e.target.value)} placeholder="从阿里云控制台复制"/></label><label>语音机器人 ID<input maxLength={100} value={draft.robotId} onChange={e => update('robotId', e.target.value)} placeholder="创建机器人后填写"/></label><div className="phone-field-row"><label>实例地域<input maxLength={40} value={draft.region} onChange={e => update('region', e.target.value)} placeholder="以控制台显示为准"/></label><label>申请的服务号码<input type="tel" maxLength={40} value={draft.phoneNumber} onChange={e => update('phoneNumber', e.target.value)} placeholder="审核开通后填写"/></label></div></details>
          <div className="phone-draft-actions"><button className="phone-save" type="button" onClick={save}><Save size={16}/>保存草稿</button><button type="button" onClick={download}>下载配置草稿</button></div>
          <p className="phone-save-status" role="status">{saved || '尚未保存 · 仅本机可见'}</p>
        </section>
        <div className="phone-overview">
          <section className="phone-preview" aria-labelledby="preview-title">
            <div className="phone-section-heading"><span>02 / 通话预览</span><h2 id="preview-title">{draft.direction === 'inbound' ? '一通来电，由 AI 接待。' : '让 AI 主动开启对话。'}</h2></div>
            <div className="phone-call-path" aria-label="手机通过电话线路连接 AI"><span><Phone size={23}/>手机</span><ArrowRight size={18}/><span className="pending-line">电话线路<small>待接入</small></span><ArrowRight size={18}/><span><AudioLines size={23}/>AI 助手</span></div>
            <div className="phone-speech"><span>{draft.name.trim() || 'AI 助手'} · 开场白文字预览</span><p>{draft.greeting.trim() || '填写开场白后，在这里预览。'}</p></div>
            <dl className="phone-facts"><div><dt>电话服务商</dt><dd>阿里云／伶鹊</dd></div><div><dt>平台接入</dt><dd>尚未连接</dd></div><div><dt>真实通话</dt><dd>尚未验收</dd></div></dl>
            <button className="phone-unavailable" disabled><Phone size={17}/>线路开通后启用通话</button>
            <p className="phone-preview-note">当前为配置预览，不会拨号，也不会调用付费语音模型。</p>
          </section>
          <section className="phone-activation" aria-labelledby="activation-title">
            <div className="phone-section-heading"><span>03 / 接通之前</span><h2 id="activation-title">还需要完成什么？</h2></div>
            <ol><li><span>1</span><div><h3>准备企业账号与号码</h3><p>完成企业实名认证，按业务用途申请电话线路和号码。个人手机用来拨打服务号码或接听平台来电。</p></div></li><li><span>2</span><div><h3>{draft.direction === 'inbound' ? '创建数字员工与语音机器人' : '开通智能外呼机器人'}</h3><p>{draft.direction === 'inbound' ? '开通云联络中心数字员工，创建语音导航机器人，绑定来电流程与号码；需要转人工时再增加人工坐席。' : '创建外呼机器人与对话流程，申请可外呼的线路。呼入机器人不能直接替代外呼服务。'}</p></div></li><li><span>3</span><div><h3>网站集成与真实试通</h3><p>后端通过 RAM 身份调用 OpenAPI，配置实例与机器人标识，再用真实手机检查接通、双向声音和挂断。</p></div></li></ol>
            <details className="phone-key-help"><summary>需要填写 API Key 吗？</summary><p>只在阿里控制台创建和使用机器人，不需要先给本网站提供密钥。接入本网站时，通常使用 RAM 用户的 AccessKey ID 与 AccessKey Secret（或角色临时凭据），不是百炼 API Key。</p><p>密钥只配置到服务器受限环境中；本页不收集、不保存密钥。</p><a href="https://help.aliyun.com/zh/ccs/cccai/getting-started/large-model-voice-incoming-robot-access-scheme" target="_blank" rel="noreferrer">查看阿里云官方呼入接入流程 ↗</a></details>
            <button type="button" className="phone-copy" onClick={copyPlan}><Clipboard size={15}/>复制接入需求</button><span className="phone-copy-status" role="status">{copied && <><Check size={13}/>{copied}</>}</span>
          </section>
        </div>
      </div>
      <div className="phone-bottom-note"><p>想先听听 AI 的声音？网页语音已提供百炼和豆包体验。</p><a href={appPath('/')}>去网页语音 <ArrowRight size={16}/></a></div>
      <footer><span>ZHISHU CLOUDLINK <i> / </i> VOICE STUDIO</span><span>电话 AI · 配置准备阶段</span></footer>
    </main>
  </div>;
}
