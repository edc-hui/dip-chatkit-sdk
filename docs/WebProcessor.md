## 1. 组件介绍

- **组件名称**：`WebProcessorBlock`
- **组件用途**：承接 DIP `web_processor` 工具返回的页面地址，将工具标签与页面预览同时渲染到消息流中。
- **使用范围**：`assistant` 和 `copilot` 同时使用。
- **实现风格**：整体交互、卡片结构、放大弹窗尺寸和视觉风格参考 `Json2PlotBlock`。

## 2. 设计依据

### 2.1 ChatKit 设计文档

根据 `design/ChatKit.pdf`：

1. `ChatKitBase` 预留了 `AppendWebprocessor(result: WebprocessorResult): void` 的能力入口。
2. `CopilotBase` 和 `AssistantBase` 都继承自 `ChatKitBase`，因此 `web_processor` 的消息块需要在两套视图中保持一致能力。

### 2.2 ChatKit for DIP 设计文档

根据 `design/ChatKit for DIP.pdf`：

1. 当 `content.skill_info.name === "web_processor"` 时，需要从 `content.answer.result` 中解析 `url` 和 `title`。
2. 解析后调用 `AppendWebprocessor()`，将结果输出到界面。
3. 工具块仍然遵循 `Block` 工具处理流程，支持与注册机制共存。

### 2.3 参考实现

本文档结构与交互拆分参考：

- `docs/Json2PlotBlock.md`
- `src/components/base/assistant/blocks/Json2PlotBlock.tsx`
- `src/components/base/assistant/blocks/Json2PlotBlock/Json2PlotModal.tsx`

## 3. 目标交互

### 3.1 工具标签展示

1. 拿到 `webProcessor` 数据中的 `title` 和 `url` 后：
2. `title` 作为通用工具标签标题显示。
3. 如果没有 `title`，标题回退为 `WebProcessor`。
4. 标题右侧追加 `url` 链接按钮。
5. 点击链接按钮后，在新标签页打开对应地址。

### 3.2 工具内容展示

1. 拿到 `url` 后，在工具块下方直接渲染 iframe 预览。
2. iframe 外层使用卡片包裹，风格与 `Json2PlotBlock` 保持一致。
3. 卡片右上角提供两个按钮：
   - 放大
   - 新窗口打开

### 3.3 放大弹窗

1. 点击放大按钮后，打开预览弹窗。
2. 弹窗大小参考 `Json2PlotModal`：
   - `width: 90vw`
   - `max-width: 1200px`
   - `height: 90vh`
   - `max-height: 800px`
3. 弹窗内继续加载同一地址的 iframe。

### 3.4 新窗口打开

1. 卡片右上角“新窗口打开”按钮点击后，调用 `window.open(url, '_blank', 'noopener,noreferrer')`。
2. 工具标签行上的链接按钮与卡片右上角按钮行为一致。

## 4. 数据结构方案

### 4.1 新增类型

建议在 `src/types/index.ts` 中新增：

```typescript
export interface WebProcessorDataSchema {
  /** 页面标题，可选 */
  title?: string;
  /** 页面地址 */
  url: string;
  /** 页面建议尺寸，[width, height] */
  size?: [number, number];
}

export interface WebProcessorBlock
  extends ContentBlock<BlockType.WEB_PROCESSOR, WebProcessorDataSchema> {}
```

同时扩展：

```typescript
export enum BlockType {
  ...
  WEB_PROCESSOR = 'WebProcessor',
}

export interface ChatMessage {
  content: Array<
    TextBlock |
    MarkdownBlock |
    WebSearchBlock |
    ToolBlock |
    Json2PlotBlock |
    WebProcessorBlock
  >;
}
```

### 4.2 OpenAPI 对齐说明

当前 `openapi/adp/agent-app/agent-app.schemas.yaml` 中：

- `WebProcessorResultData` 只定义了 `url` 和 `size`
- 未显式定义 `title`

但设计文档和本次需求都明确依赖 `title`。因此技术方案建议二选一：

1. 优先方案：在 OpenAPI 中补充 `title?: string`
2. 兼容方案：解析时优先取 `answer.result.title`，没有则退回 `skill title`，再没有则使用 `WebProcessor`

建议最终同时支持两种来源，避免前后端升级不同步。

## 5. 组件拆分

为避免 `assistant` / `copilot` 各自复制一套 iframe 逻辑，建议新增共享目录：

### 5.1 文件列表

- `src/components/base/shared/blocks/WebProcessorBlock.tsx` - 主组件，整合工具标签、预览卡片、弹窗状态
- `src/components/base/shared/blocks/WebProcessorBlock/WebProcessorContentView.tsx` - iframe 卡片视图
- `src/components/base/shared/blocks/WebProcessorBlock/WebProcessorModal.tsx` - 放大弹窗
- `src/components/base/shared/blocks/WebProcessorBlock/index.ts` - 导出文件

### 5.2 接入文件

- `src/components/base/assistant/MessageItem.tsx`
- `src/components/base/copilot/MessageItem.tsx`
- `src/components/base/ChatKitBase.tsx`
- `src/components/dip/DIPBase.tsx`
- `src/types/index.ts`

### 5.3 组件职责

1. `WebProcessorBlock`
   - 渲染工具标签
   - 渲染 iframe 卡片
   - 维护放大弹窗开关

2. `WebProcessorContentView`
   - 渲染卡片头部操作区
   - 渲染 iframe
   - 处理 iframe 加载失败占位

3. `WebProcessorModal`
   - 负责放大态展示
   - 复用同一份 iframe 视图结构
   - 处理遮罩关闭、右上角关闭、ESC 关闭

4. `WebProcessorIframe`
   - 作为独立 iframe 渲染组件
   - 根据传入参数切换聊天态和弹窗态尺寸
   - 统一处理 URL 校验、加载态、失败态和安全属性

## 6. 渲染结构

参考 `Json2PlotBlock`，`WebProcessorBlock` 采用“工具标签 + 内容卡片”的组合结构：

```tsx
<>
  <ToolBlock block={toolBlock} />
  <WebProcessorContentView
    data={data}
    onZoom={openModal}
    onOpenNewWindow={openInNewTab}
  />
  <WebProcessorModal
    open={isModalOpen}
    data={data}
    onClose={closeModal}
  />
</>
```

其中：

1. `ToolBlock` 只负责展示工具标签和耗时。
2. iframe 预览不放在 `ToolDrawer` 中，而是直接跟在工具块后面。
3. 这样可以与 `Json2PlotBlock` 的“消息内直接展示结果”方式保持一致。

## 7. ToolBlock 标题方案

### 7.1 标题规则

标题来源优先级：

1. `data.title`
2. `answer.result.title`
3. `block.content.title`
4. 字面量 `WebProcessor`

### 7.2 URL 按钮规则

工具标签区域需要展示：

- 左侧：工具图标 + 标题
- 右侧：URL 链接按钮

建议按钮文案直接显示域名或简化后的 URL，避免整串地址撑开布局。

示例：

```tsx
title: data.title || 'WebProcessor'
extraAction: <a href={data.url} target="_blank" rel="noopener noreferrer">example.com</a>
```

如果现有 `ToolBlock` 不支持右侧自定义操作区，则需要扩展 `ToolCallData`：

```typescript
export interface ToolCallData {
  ...
  extraAction?: React.ReactNode;
}
```

如果不希望改动通用 `ToolBlock` 结构，则可在 `WebProcessorBlock` 内部自绘一层与 `ToolBlock` 同风格的头部区域。两种方案里，更推荐扩展 `ToolBlock`，便于后续其他工具复用。

## 8. iframe 卡片方案

### 8.1 卡片布局

iframe 卡片放在工具标签下方，建议包含：

1. 卡片头部
   - 左侧：标题或 URL 摘要
   - 右侧：放大、新窗口打开
2. 卡片内容区
   - iframe

### 8.2 iframe 默认尺寸

优先级：

1. 使用 `data.size`
2. 没有 `size` 时使用默认值

建议默认值：

- 普通态高度：`480px`
- 宽度：`100%`
- 最小高度：`320px`

建议将 iframe 抽成独立组件，例如：

```typescript
export interface WebProcessorIframeProps {
  url: string;
  title?: string;
  size?: [number, number];
  mode?: 'chat' | 'modal';
}
```

尺寸规则：

1. `mode='chat'` 时用于消息流内展示，走卡片态默认尺寸
2. `mode='modal'` 时用于放大弹窗内展示，撑满弹窗内容区
3. 两种模式共用同一套 URL 校验、失败兜底和 iframe 安全配置

### 8.3 iframe 属性建议

```tsx
<iframe
  src={safeUrl}
  title={data.title || 'WebProcessor'}
  className="w-full h-full rounded-b-lg bg-white"
  loading="lazy"
  referrerPolicy="no-referrer-when-downgrade"
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
/>
```

### 8.4 iframe 工具栏处理

需求要求 iframe 只保留页面内容区，不显示 iframe 自带工具。

实现上需要区分两类情况：

1. **如果 `web_processor` 生成页本身支持无工具栏模式**
   - 优先通过查询参数或约定参数关闭工具栏
   - 例如：`?toolbar=0`、`?header=0`、`?embed=1`
   - 由 `WebProcessorIframe` 统一拼装最终展示 URL

2. **如果目标页面不支持关闭工具栏**
   - 前端无法直接跨域移除页面内部工具栏
   - 需要 `web_processor` 页面侧提供“嵌入态/纯内容态”能力

因此本方案要求：

1. `WebProcessorIframe` 统一使用“嵌入态 URL”加载
2. `web_processor` 页面需要提供仅内容区版本，不渲染顶部工具栏、操作条、浏览器内页头
3. chat 内展示和弹窗展示都复用同一套“纯内容态”地址，只通过组件参数控制尺寸，不切换页面结构

建议为组件增加一个 URL 规范化函数：

```typescript
function buildEmbedUrl(url: string): string
```

职责：

1. 补充 embed 参数
2. 关闭工具栏参数
3. 保留原始查询参数
4. 输出最终用于 iframe 的纯内容地址

## 9. 弹窗方案

### 9.1 弹窗行为

与 `Json2PlotModal` 保持一致：

1. 点击遮罩关闭
2. 点击右上角关闭按钮关闭
3. 按 `ESC` 关闭

### 9.2 弹窗尺寸

复用 `Json2PlotModal` 的尺寸策略：

```tsx
className="relative bg-white rounded-lg shadow-lg flex flex-col w-[90vw] max-w-[1200px] h-[90vh] max-h-[800px] p-5"
```

### 9.3 弹窗内容

弹窗中仍然是 iframe，不需要重新请求工具数据，只复用当前块上的纯内容态 URL。

## 10. ChatKitBase 接入方案

根据 `ChatKit.pdf` 的 `AppendWebprocessor` 设计，建议在 `src/components/base/ChatKitBase.tsx` 中新增：

```typescript
protected appendWebProcessorBlock(
  messageId: string,
  data: WebProcessorDataSchema,
  consumeTime?: number
): void;

protected updateWebProcessorBlock(
  messageId: string,
  data: WebProcessorDataSchema,
  consumeTime?: number
): void;
```

逻辑与 `appendJson2PlotBlock` / `updateJson2PlotBlock` 保持一致：

1. 首帧插入 `WEB_PROCESSOR` block
2. 中间帧若同一工具继续补数据，则更新最后一个同类型 block
3. `consumeTime` 直接透传到 block

## 11. DIPBase 接入方案

### 11.1 流式消息处理

在 `src/components/dip/DIPBase.tsx` 中，`web_processor` 不再走默认工具逻辑，而是走专用分支：

```typescript
if (skillName === 'web_processor') {
  const webProcessorData = this.extractWebProcessorData(item.answer);
  if (webProcessorData) {
    this.appendWebProcessorBlock(messageId, webProcessorData, consumeTime);
  }
}
```

历史消息组装 `appendSkillOrLLMContentToMessage()` 同样增加该分支。

### 11.2 数据提取函数

建议新增：

```typescript
public extractWebProcessorData(answer: any): WebProcessorDataSchema | null
```

提取规则：

1. `url` 优先从 `answer.result.url` 获取
2. `title` 优先从 `answer.result.title` 获取
3. `size` 从 `answer.result.size` 获取
4. `url` 为空时直接返回 `null`

### 11.3 consumeTime

继续沿用当前技能耗时计算逻辑：

```typescript
consumeTime = end_time - start_time
```

与 `ChatKit for DIP.pdf` 中的说明保持一致。

## 12. Assistant / Copilot 接入点

### 12.1 MessageItem

`assistant` 和 `copilot` 的 `MessageItem.tsx` 都要增加 `WEB_PROCESSOR` 分支。

示例：

```tsx
case BlockType.WEB_PROCESSOR:
  return <WebProcessorBlock key={index} block={block} />
```

### 12.2 blocks/index.ts

两侧的 `blocks/index.ts` 也需要导出 `WebProcessorBlock`。

### 12.3 复用策略

由于该组件要求两端行为一致，推荐：

1. 核心实现放在 `shared`
2. `assistant` / `copilot` 只做导出和消息路由

这样可以避免后续一侧弹窗样式、iframe 属性、按钮行为与另一侧不一致。

## 13. 异常与边界处理

### 13.1 URL 校验

只允许 `http:` 和 `https:`：

1. 非法协议直接不渲染 iframe
2. 展示“链接不可预览”占位
3. 仍允许用户通过新窗口按钮打开前先做同样校验

### 13.2 iframe 被目标站点拒绝嵌入

部分页面会因为 `X-Frame-Options` 或 CSP 拒绝被 iframe 加载。此时：

1. 保留工具标签
2. 卡片区展示错误占位文案
3. 保留“新窗口打开”按钮，作为兜底访问方式

### 13.3 标题为空

显示 `WebProcessor`，不影响交互。

### 13.4 size 非法

若 `size` 长度不为 2 或存在非数字值，则退回默认高度。

## 14. 性能建议

1. iframe 使用 `loading="lazy"`
2. 弹窗关闭后卸载弹窗内 iframe，避免双实例长期驻留
3. 消息流中只保留普通态 iframe，一个块只维护一个弹窗状态
4. 不在流式过程中频繁销毁重建同一 iframe，只有 `url` 变化时才更新

## 15. 测试建议

### 15.1 单元测试

1. `extractWebProcessorData()` 正确解析 `url/title/size`
2. `title` 缺失时回退 `WebProcessor`
3. 非法 URL 不渲染 iframe
4. `appendWebProcessorBlock()` / `updateWebProcessorBlock()` 行为正确

### 15.2 组件测试

1. 工具标签正确显示标题和 URL 按钮
2. iframe 卡片正确渲染
3. 放大按钮能打开弹窗
4. 新窗口按钮调用正确
5. ESC / 遮罩 / 关闭按钮都能关闭弹窗

### 15.3 集成测试

1. `assistant` 中 `web_processor` 正常展示
2. `copilot` 中 `web_processor` 正常展示
3. 历史消息回放时可还原 `web_processor` 结果
4. 流式首帧插入、后续帧更新不重复生成多个相同块

## 16. 实施顺序建议

1. 扩展 `types` 与 `BlockType`
2. 在 `ChatKitBase` 增加 `append/updateWebProcessorBlock`
3. 在 `DIPBase` 增加 `extractWebProcessorData` 和专用分支
4. 实现共享 `WebProcessorBlock` / `WebProcessorModal`
5. 在 `assistant` / `copilot` 的 `MessageItem` 中接入
6. 补充 OpenAPI 中的 `title` 字段说明

## 17. 结论

`web_processor` 不适合继续走纯 `DefaultToolResult + ToolDrawer` 方案，原因是本次需求明确要求：

1. 结果直接在消息流中内嵌展示
2. 需要 iframe 卡片和放大弹窗
3. 需要 assistant / copilot 一致体验

因此推荐实现为与 `Json2PlotBlock` 同级的专用消息块：`WebProcessorBlock`。  
该方案与 `ChatKit.pdf`、`ChatKit for DIP.pdf` 中的 `AppendWebprocessor()` 设计保持一致，也能最小化后续扩展成本。
