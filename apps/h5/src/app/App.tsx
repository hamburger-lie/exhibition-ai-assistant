import { useState, type ReactNode } from 'react';
import { BrowserRouter, useSearchParams } from 'react-router-dom';

import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import { ChatProvider, DEFAULT_EXPO_ID } from '../features/chat/ChatProvider.js';
import { AppRoutes } from './router.js';

/**
 * expo_id 只在首次进入时从 URL 读取并冻结：后续导航到 /map 等二级页面时
 * query 会变化，不能因此重建会话上下文（规格 §7.1：Chat 流在 SPA 全局状态
 * 中继续）。
 */
function ChatProviderFromUrl({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const [expoId] = useState(
    () => searchParams.get('expo_id') ?? DEFAULT_EXPO_ID,
  );

  return <ChatProvider expoId={expoId}>{children}</ChatProvider>;
}

export function App() {
  return (
    <BrowserRouter>
      <ChatProviderFromUrl>
        <AppRoutes />
      </ChatProviderFromUrl>
    </BrowserRouter>
  );
}
