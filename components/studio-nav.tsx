'use client';
import { useLocale } from '@/lib/i18n';

import { ArrowUpRight, AudioLines, Phone } from 'lucide-react';
import { appPath } from '@/lib/base-path';

export default function StudioNav({ page }: { page: 'web' | 'phone' }) {
 const { t, locale, setLocale } = useLocale();
  return <header className="topbar studio-header">
    <a className="brand" href={appPath('/')} aria-label={t("智树云联语音工作台首页")}>
      <span className="brand-mark"><AudioLines size={23}/></span>
      <strong>{t("智树云联")}<span>VOICE STUDIO</span></strong>
    </a>
    <nav className="studio-nav" aria-label={t("工作台导航")}>
      <a href={appPath('/')} aria-current={page === 'web' ? 'page' : undefined}><AudioLines size={17}/>{t("网页语音")}</a>
      <a href={appPath('/phone/')} aria-current={page === 'phone' ? 'page' : undefined}><Phone size={17}/>{t("电话 AI")}</a>
    </nav>
    <fieldset className="language-switch" aria-label={locale === 'zh' ? '界面语言' : 'Interface language'}><button type="button" lang="zh-CN" aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>中文</button><button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>English</button></fieldset>
    <a className="back" href="https://gptimg2.you/zhishu-cloudlink/" aria-label={t("返回智树云联官网")}>{t("返回官网")}<ArrowUpRight size={16}/></a>
  </header>;
}
