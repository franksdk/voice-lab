import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '实时语音体验 · 智树云联', description: '选择销售场景，通过麦克风体验端到端实时 AI 语音对话。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
