import { Route, Routes } from 'react-router-dom';

import { ChatPage } from '../features/chat/ChatPage.js';
import { EntityDetailPage } from '../features/entity/EntityDetailPage.js';
import { MapPage } from '../features/map/MapPage.js';

/**
 * 规格 §3：空对话首屏与会话共用 `/`，不存在独立的「首页」路由；
 * 地图是由 Chat 卡片动作进入的二级页面。
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ChatPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route
        path="/entity/:entity_type/:entity_id"
        element={<EntityDetailPage />}
      />
    </Routes>
  );
}
