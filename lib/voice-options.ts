export type ProviderId = 'aliyun' | 'doubao';
export type VoiceOption = { id: string; label: string; detail: string; languages?: string[] };
export type LanguageOption = { id: string; label: string; instruction: string; group: 'language' | 'dialect' };

export const aliyunVoices: VoiceOption[] = [
  { id: 'longanqian', label: 'Longan Qian', detail: '默认音色' },
  { id: 'longanlingxin', label: '灵心', detail: '知心温暖 · 女声' },
  { id: 'longanlingxi', label: '灵犀', detail: '可爱甜美 · 女声' },
  { id: 'longanxiaoxin', label: '小欣', detail: '亲切活泼 · 女声' },
  { id: 'longanlufeng', label: '陆枫', detail: '明亮开朗 · 男声' },
];

export const doubaoVoices: VoiceOption[] = [
  { id: 'zh_female_vv_jupiter_bigtts', label: 'VV', detail: '活泼灵动 · 女声', languages: ['zh', 'dongbei', 'sichuan', 'shaanxi', 'yue', 'beijing', 'henan', 'tianjin', 'shanghai'] },
  { id: 'zh_female_xiaohe_jupiter_bigtts', label: '小何', detail: '甜美活泼 · 女声', languages: ['zh', 'dongbei', 'sichuan', 'shaanxi', 'yue', 'beijing', 'henan', 'tianjin', 'shanghai'] },
  { id: 'zh_male_yunzhou_jupiter_bigtts', label: '云舟', detail: '清爽沉稳 · 男声', languages: ['zh', 'dongbei', 'sichuan', 'shaanxi', 'yue', 'beijing', 'henan', 'tianjin', 'shanghai'] },
  { id: 'zh_male_xiaotian_jupiter_bigtts', label: '小天', detail: '清爽磁性 · 男声', languages: ['zh', 'dongbei', 'sichuan', 'shaanxi', 'yue', 'beijing', 'henan', 'tianjin', 'shanghai'] },
  { id: 'en_male_tim_uranus_bigtts', label: 'Tim', detail: '美式英语 · 男声', languages: ['en'] },
  { id: 'en_female_dacey_uranus_bigtts', label: 'Dacey', detail: '美式英语 · 女声', languages: ['en'] },
  { id: 'en_female_stokie_uranus_bigtts', label: 'Stokie', detail: '美式英语 · 女声', languages: ['en'] },
];

const commonLanguages: LanguageOption[] = [
  { id: 'zh', label: '中文（普通话）', instruction: '中文普通话', group: 'language' },
  { id: 'en', label: 'English（英语）', instruction: '英语', group: 'language' },
];

export const aliyunLanguages: LanguageOption[] = [
  ...commonLanguages,
  { id: 'de', label: 'Deutsch（德语）', instruction: '德语', group: 'language' },
  { id: 'es', label: 'Español（西班牙语）', instruction: '西班牙语', group: 'language' },
  { id: 'fr', label: 'Français（法语）', instruction: '法语', group: 'language' },
  { id: 'id', label: 'Bahasa Indonesia（印尼语）', instruction: '印尼语', group: 'language' },
  { id: 'it', label: 'Italiano（意大利语）', instruction: '意大利语', group: 'language' },
  { id: 'ja', label: '日本語（日语）', instruction: '日语', group: 'language' },
  { id: 'ko', label: '한국어（韩语）', instruction: '韩语', group: 'language' },
  { id: 'pt', label: 'Português（葡萄牙语）', instruction: '葡萄牙语', group: 'language' },
  { id: 'ru', label: 'Русский（俄语）', instruction: '俄语', group: 'language' },
  ...[
    ['yue','广东话'],['chongqing','重庆话'],['dongbei','东北话'],['gansu','甘肃话'],['guizhou','贵州话'],['zhejiang','浙江话'],['hebei','河北话'],['henan','河南话'],['hubei','湖北话'],['hunan','湖南话'],['jiangxi','江西话'],['ningbo','宁波话'],['ningxia','宁夏话'],['qingdao','青岛话'],['shaanxi','陕西话'],['shanxi','山西话'],['shandong','山东话'],['shanghai','上海话'],['sichuan','四川话'],['yunnan','云南话'],
  ].map(([id,label]) => ({ id, label, instruction: label, group: 'dialect' as const })),
];

export const doubaoLanguages: LanguageOption[] = [
  ...commonLanguages,
  ...[['dongbei','东北话'],['sichuan','四川话'],['shaanxi','陕西话'],['yue','粤语'],['beijing','北京话'],['henan','河南话'],['tianjin','天津话'],['shanghai','上海话']]
    .map(([id,label]) => ({ id, label, instruction: label, group: 'dialect' as const })),
];

export const languagesFor = (provider: string) => provider === 'doubao' ? doubaoLanguages : aliyunLanguages;
export const systemVoicesFor = (provider: string) => provider === 'doubao' ? doubaoVoices : aliyunVoices;
export const languageInstruction = (id: string) => [...aliyunLanguages, ...doubaoLanguages].find(item => item.id === id)?.instruction || '中文普通话';
