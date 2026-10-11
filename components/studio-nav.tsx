'use client';

import { ArrowUpRight, AudioLines, Mic2, Phone } from 'lucide-react';
import { appPath } from '@/lib/base-path';

export default function StudioNav({ page }: { page: 'web' | 'phone' | 'speech' }) {
  return <header className="topbar studio-header">
    <a className="brand" href={appPath('/')} aria-label="智树云联语音工作台首页">
      <span className="brand-mark"><AudioLines size={23}/></span>
      <strong>智树云联<span>VOICE STUDIO</span></strong>
    </a>
    <nav className="studio-nav" aria-label="工作台导航">
      <a href={appPath('/')} aria-current={page === 'web' ? 'page' : undefined}><AudioLines size={17}/>网页语音</a>
      <a href={appPath('/phone/')} aria-current={page === 'phone' ? 'page' : undefined}><Phone size={17}/>电话 AI</a>
      <a href={appPath('/speech-lab/')} aria-current={page === 'speech' ? 'page' : undefined}><Mic2 size={17}/>孟加拉语测试</a>
    </nav>
    <a className="back" href="https://gptimg2.you/zhishu-cloudlink/" aria-label="返回智树云联官网">返回官网 <ArrowUpRight size={16}/></a>
  </header>;
}
