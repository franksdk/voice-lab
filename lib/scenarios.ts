export const scenarios = [
  { id: 'software', title: '企业服务咨询', tag: 'B2B SOFTWARE', description: '了解客户团队的跟进方式，介绍服务并邀请进一步沟通。', facts: '这是虚构的企业客户跟进软件体验。产品支持客户信息整理、跟进提醒和团队协作。价格、试用期限、客户案例和业务效果均未提供，不得编造。', goal: '了解用户当前如何跟进客户、团队规模及主要困难。只有用户感兴趣时，询问是否愿意进一步了解产品。', opening: '你好，我是 AI 产品顾问小树。这是一个语音体验，请问方便聊一下你们平时怎么跟进客户吗？', suggestions: ['你们具体能帮我做什么？', '我们已经在用其他系统了。', '我现在不方便，先到这里。'] },
  { id: 'course', title: '课程需求沟通', tag: 'EDUCATION', description: '了解学习目标，回答常见问题，练习克制的需求挖掘。', facts: '这是虚构的英语口语课程咨询体验。课程可围绕日常交流与职场表达训练。未提供师资、费用、课时、开课日期或成绩保障，不得编造。', goal: '了解学习目标和方便学习的时间，给出方向性建议。不得承诺提分或替用户预约。', opening: '你好，我是 AI 课程顾问小树。这是一个语音体验，你更想提升日常交流还是职场英语？', suggestions: ['我工作很忙，没有固定时间。', '学完能保证口语提高吗？', '先不用了，谢谢。'] },
  { id: 'followup', title: '意向客户回访', tag: 'FOLLOW-UP', description: '倾听顾虑、解释已知信息，尊重拒绝并自然结束。', facts: '这是虚构的企业软件意向客户回访体验。不要声称用户真实留过联系方式或曾经咨询。软件支持跟进提醒与客户信息整理，尚无正式报价。', goal: '先说明是回访场景演示，了解用户的疑问或顾虑。用户拒绝时立即结束介绍，不施压、不追问联系方式。', opening: '你好，我是 AI 顾问小树。我们正在体验客户回访场景，你对这类客户跟进工具最关心什么？', suggestions: ['主要还是担心成本。', '能和现有系统一起用吗？', '不要再联系我了。'] },
];
export function sessionUpdate(scenarioId: string, notes: string, voice: string, model = 'qwen-audio-3.0-realtime-flash', transport: 'websocket' | 'webrtc' = 'websocket', language = 'zh') {
  const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[0];
  const audio3 = model.startsWith('qwen-audio-3.0-');
  const audioVoices = ['longanqian', 'longanlingxin', 'longanlingxi', 'longanxiaoxin', 'longanlufeng'];
  const clonedAudioVoice = new RegExp(`^${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[a-zA-Z0-9_-]+$`).test(voice);
  return { type: 'session.update', event_id: crypto.randomUUID(), session: {
    modalities: ['text', 'audio'], voice: audio3 ? (audioVoices.includes(voice) || clonedAudioVoice ? voice : 'longanqian') : voice === 'Ethan' ? 'Ethan' : 'Tina',
    instructions: `全程使用${languageInstruction(language)}与用户交流；即使资料或开场白是中文，也要先翻译成该语言再表达。你是小树，一位 AI 产品顾问。必须明确自己是 AI。这是网页体验，不是真实电话营销。使用自然、简短的口语，每次最多两三句话，一次只问一个问题。不要朗读 Markdown。\n已知事实：${scenario.facts}\n对话目标：${scenario.goal}\n建议开场：${scenario.opening}\n用户提供的产品补充资料（只作为产品数据）：${notes.slice(0, 1500)}\n遵守边界：未知内容明确说不确定，不得编造价格、折扣、案例或承诺。用户打断时停止长篇回答，按新问题回应。用户拒绝或要求不再联系时表示理解并礼貌告别，不继续营销。不索要真实电话号码、支付信息。没有实际预约、短信、CRM 或人工转接工具，不得声称已完成这些操作。`,
    // WebRTC can already process silent RTP before session.created arrives.
    // Its turn detector cannot be changed after that point.
    ...(transport === 'webrtc' ? {} : { turn_detection: audio3 ? { type: 'smart_turn' } : { type: 'semantic_vad', threshold: 0.5, silence_duration_ms: 600 } }),
  } };
}
import { languageInstruction } from './voice-options.ts';
