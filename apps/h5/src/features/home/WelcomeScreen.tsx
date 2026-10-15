import type { ComponentType } from 'react';

import type { ConfigData, QuickAction } from '../../shared/api/client.js';
import {
  IconBooth,
  IconEvent,
  IconExhibitor,
  IconProduct,
  type IconProps,
} from '../../shared/ui/icons.js';

/**
 * 空对话首屏欢迎区（规格 §3.1）。首条消息发送后由 ChatPage 收起。
 *
 * 快捷入口与问题示例都来自 E02 配置，不在组件里写死文案；图标按
 * quick_action.id 前缀映射到统一线性图标集，未知 id 回退到展商图标。
 */

const ACTION_ICONS: Record<string, ComponentType<IconProps>> = {
  quick_exhibitor: IconExhibitor,
  quick_product: IconProduct,
  quick_booth: IconBooth,
  quick_event: IconEvent,
};

export interface WelcomeScreenProps {
  config: ConfigData;
  onPickPrompt: (prompt: string) => void;
}

export function WelcomeScreen({ config, onPickPrompt }: WelcomeScreenProps) {
  // 规格 §3.1：两条动态问题示例。ConfigResponse schema 已冻结且
  // additionalProperties:false，无法新增字段，因此复用配置里前两个快捷入口的
  // prompt 作为示例问题——依然由接口数据驱动，不写死在组件中。
  const examples = config.quick_actions.slice(0, 2);

  return (
    <section className="welcome">
      <div>
        <h1 className="welcome__headline">你好，我是 {config.assistant_name}</h1>
        <p className="welcome__sub">{config.welcome_text}</p>
      </div>

      <div className="welcome__actions">
        {config.quick_actions.map((action: QuickAction) => {
          const Icon = ACTION_ICONS[action.id] ?? IconExhibitor;
          return (
            <button
              key={action.id}
              type="button"
              className="quick-action"
              onClick={() => onPickPrompt(action.prompt)}
            >
              <Icon className="quick-action__icon" />
              <span className="quick-action__label">{action.label}</span>
            </button>
          );
        })}
      </div>

      {examples.length > 0 && (
        <div className="welcome__examples">
          <p className="welcome__examples-title">你可以这样问</p>
          {examples.map((action) => (
            <button
              key={`example_${action.id}`}
              type="button"
              className="example-link"
              onClick={() => onPickPrompt(action.prompt)}
            >
              {action.prompt}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
