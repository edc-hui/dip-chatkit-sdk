import {
  ApplicationContext,
  ChatMessage,
  OnboardingInfo,
  WebSearchQuery,
  WebSearchResult,
  RoleType,
  ChartDataSchema,
  ConversationHistory,
  BlockType,
  DefaultToolResult,
  WebProcessorDataSchema,
} from '../../types';
import { Constructor } from '../../utils/mixins';
import { Text2SqlIcon, Text2MetricIcon, AfSailorIcon } from '../icons';

/**
 * DIP �?AssistantMessage 接口
 * 对应 agent-app.schemas.yaml#/components/schemas/Message
 */
interface AssistantMessage {
  message?: {
    id?: string;
    conversation_id?: string;
    role?: string;
    content?: {
      middle_answer?: {
        progress?: Progress[];
      };
    };
  };
  error?: string;
}

/**
 * OtherTypeAnswer 接口
 * 智能体输出的非文本类型内�?
 * 对应 agent-app.schemas.yaml#/components/schemas/OtherTypeAnswer
 */
interface OtherTypeAnswer {
  stage?: string;
  answer?: any;
  skill_info?: SkillInfo;
  start_time?: number;
  end_time?: number;
}

/**
 * SkillInfo 接口
 * 调用技能的技能详�?
 * 对应 agent-app.schemas.yaml#/components/schemas/SkillInfo
 */
interface SkillInfo {
  type?: 'TOOL' | 'MCP' | 'AGENT';
  name?: string;
  args?: Array<{
    name?: string;
    type?: string;
    value?: string;
  }>;
}

/**
 * Progress 接口
 * 智能体执行过程中的一个步�?
 */
interface Progress {
  stage?: string;
  answer?: string | any;
  skill_info?: SkillInfo;
  start_time?: number;
  end_time?: number;
}

/**
 * EventMessage 接口
 * DIP �?Event Stream Message
 */
interface EventMessage {
  seq_id?: number;
  key?: Array<string | number>;
  action?: 'append' | 'upsert' | 'end';
  content?: any;
}

/**
 * DIPBase �?props 接口
 */
export interface DIPBaseProps {
  /** AISHU DIP �?Agent Key,用作路径参数 */
  agentKey: string;

  /** 访问令牌,需要包�?Bearer 前缀 (已废弃，请使�?token 属�? */
  bearerToken?: string;

  /** 服务端基础地址,应包�?/api/agent-app/v1 前缀 */
  baseUrl?: string;

  /** agent 版本�?v0"表示最新版本，默认 "v0" */
  agentVersion?: string;

  /** 智能体执行引擎版本，最新为"v2"，默�?"v2" */
  executorVersion?: string;

  /** 智能体所属的业务�?用于 agent-factory API */
  businessDomain?: string;

  /** 调用接口时携带的令牌 */
  token?: string;

  /** 刷新 token 的方�?*/
  refreshToken?: () => Promise<string>;
}

/**
 * DIPBase Mixin 函数
 * 根据 TypeScript 官方文档实现�?mixin 模式
 *
 * �?mixin 为基础类添�?AISHU DIP API 的集成能力，包括�?
 * - getOnboardingInfo(): 获取开场白信息
 * - generateConversation(): 创建新会�?
 * - reduceAssistantMessage(): �?EventStream 中提取出 action �?content，并根据 action �?content 增量更新�?AssistantMessage
 * - shouldRefreshToken(): 判断 API 响应的状态码是否�?401，如果是，则表示需要刷�?Token
 * - terminateConversation(): 终止会话
 *
 * @param Base 基础类，通常�?CopilotBase �?AssistantBase
 * @returns 混入 DIP 功能后的�?
 */
export function DIPBaseMixin<TBase extends Constructor>(Base: TBase) {
  return class DIPBase extends Base {
    /** 服务端基础地址 */
    public dipBaseUrl: string;

    /** Agent Key (agent 标识) */
    public dipKey: string;

    /** Agent 信息 */
    public agentInfo: any;

    /** agent 版本 */
    public dipVersion: string;

    /** 智能体执行引擎版�?*/
    public dipExecutorVersion: string;

    /** 业务�?*/
    public dipBusinessDomain: string;

    /** DIP 调用接口时携带的令牌 */
    public dipToken: string;

    /** DIP 刷新 token 的方�?*/
    public dipRefreshToken?: () => Promise<string>;

    /** LeftHeaderTool 使用�?API 方法（构造时缓存，避免流式消息时重复创建�?*/
    public _leftHeaderApiMethods?: {
      getKnowledgeNetworksDetail: (id: string) => Promise<any>;
      getKnowledgeNetworkObjectTypes: (id: string, offset?: number, limit?: number) => Promise<any>;
      getMetricInfoByIds: (ids: string[]) => Promise<any[]>;
    };

    constructor(...args: any[]) {
      super(...args);

      // �?props 中提�?DIP 相关配置
      const props = args[0] as DIPBaseProps;


      this.dipBaseUrl = props.baseUrl || 'https://dip.aishu.cn/api/agent-app/v1';
      this.dipKey = props.agentKey;
      this.dipVersion = props.agentVersion || 'latest';
      this.dipExecutorVersion = props.executorVersion || 'v2';
      this.dipBusinessDomain = props.businessDomain || 'bd_public';
      this.dipToken = props.token || '';
      this.dipRefreshToken = props.refreshToken;

      // 向后兼容：如果传入了 bearerToken 但没�?token，从 bearerToken 中提�?token
      if (props.bearerToken && !props.token) {
        // bearerToken 包含 "Bearer " 前缀，需要移�?
        this.dipToken = props.bearerToken.replace(/^Bearer\s+/i, '');
      }

      // 缓存 LeftHeaderTool �?API 方法引用，避免流式消息时每次 render 创建新对象导致子组件 useEffect 重复执行
      this._leftHeaderApiMethods = {
        getKnowledgeNetworksDetail: this.getKnowledgeNetworksDetail.bind(this),
        getKnowledgeNetworkObjectTypes: this.getKnowledgeNetworkObjectTypes.bind(this),
        getMetricInfoByIds: this.getMetricInfoByIds.bind(this),
      };
    }

    /**
     * 获取开场白和预置问�?
     * 调用 AISHU DIP �?agent-factory API 获取智能体配置信息，提取开场白和预置问�?
     * API 端点: GET /api/agent-factory/v3/agent-market/agent/{agent_key}/version/v0
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @returns 返回开场白信息，包含开场白文案和预置问�?
     */
    public async getOnboardingInfo(): Promise<OnboardingInfo> {
      try {
        // 构�?agent-factory API 的完�?URL
        let agentFactoryUrl: string;
        if (this.dipBaseUrl.startsWith('http://') || this.dipBaseUrl.startsWith('https://')) {
          // 生产环境：使用完�?URL
          const baseUrlObj = new URL(this.dipBaseUrl);
          agentFactoryUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}/api/agent-factory/v3/agent-market/agent/${encodeURIComponent(this.dipKey)}/version/v0`;
        } else {
          // 开发环境：使用相对路径走代�?
          agentFactoryUrl = `/api/agent-factory/v3/agent-market/agent/${encodeURIComponent(this.dipKey)}/version/v0`;
        }

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(agentFactoryUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.dipToken}`,
              'Content-Type': 'application/json',
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`获取 DIP 配置失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });

        // 存储 agent name �?id
        this.agentInfo = result;

        // 从响应中提取开场白和预置问�?
        const config = result.config || {};
        const openingRemarkConfig = config.opening_remark_config || {};
        const presetQuestions = config.preset_questions || [];

        // 构造开场白信息
        let prologue = '��ã������������������֣��ҿ��԰���������ݡ��ش����⡣';
        if (openingRemarkConfig.type === 'fixed' && openingRemarkConfig.fixed_opening_remark) {
          prologue = openingRemarkConfig.fixed_opening_remark;
        }

        // 提取预置问题
        const predefinedQuestions = presetQuestions
          .map((item: any) => item.question)
          .filter((q: any) => typeof q === 'string' && q.trim().length > 0);

        const onboardingInfo: OnboardingInfo = {
          prologue,
          predefinedQuestions,
        };
        return onboardingInfo;
      } catch (error) {
        // 返回默认开场白信息
        return {
          prologue: '��ã������������������֣��ҿ��԰���������ݡ��ش����⡣',
          predefinedQuestions: [],
        };
      }
    }

    /**
     * 创建新的会话
     * 调用 DIP API 创建新的会话，返回会�?ID
     * API 端点: POST /app/{agent_key}/conversation
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @param title 会话标题，通常是用户发送的第一条消息内�?
     * @returns 返回新创建的会话 ID
     */
    public async generateConversation(title?: string): Promise<string> {
      try {
        // 构造创建会话的请求�?
        const requestBody: any = {
          title: title || '�»Ự',
        };

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(
            `${this.dipBaseUrl}/app/${this.dipKey}/conversation`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.dipToken}`,
                'x-business-domain': this.dipBusinessDomain,
              },
              body: JSON.stringify(requestBody),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`创建 DIP 会话失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });

        // 从响应中获取会话 ID
        const conversationId = result.data?.id || result.id || '';
        return conversationId;
      } catch (error) {
        // 返回空字符串，允许在没有会话 ID 的情况下继续
        return '';
      }
    }

    /**
     * 调用 DIP API 发送消�?流式)
     * 该方法实现了完整的消息发送逻辑,子类无需覆盖
     * @param text 用户输入
     * @param ctx 应用上下�?
     * @param conversationID 发送的对话消息所属的会话 ID
     * @param regenerateMessageId 需要重新生成的助手消息 ID（可选，用于重新生成功能�?
     * @returns 返回助手消息
     */
    public async sendMessage(text: string, ctx: ApplicationContext, conversationID?: string, regenerateMessageId?: string): Promise<ChatMessage> {
      if (!this.dipBaseUrl) {
        throw new Error('DIP baseUrl 不能为空');
      }

      // 构造上下文信息
      let fullQuery = text;
      if (ctx && ctx.title) {
        fullQuery = `【上下文: ${ctx.title}】\n${JSON.stringify(ctx.data, null, 2)}\n\n${text}`;
      }

      // 构造请求体
      const body: any = {
        agent_id: this.agentInfo.id,
        agent_version: this.dipVersion,
        executor_version: this.dipExecutorVersion,
        query: fullQuery,
        stream: true,
        custom_querys: ctx?.data,
        conversation_id: conversationID || undefined,
        chat_option: {
          is_need_history: true,
          is_need_doc_retrival_post_process: true,
          is_need_progress: true,
          enable_dependency_cache: true,
        },
        inc_stream: true,
      };

      // 如果是重新生成，添加 regenerate_assistant_message_id 参数
      if (regenerateMessageId) {
        body.regenerate_assistant_message_id = regenerateMessageId;
      }

      // 使用 executeDataAgentWithTokenRefresh 包装 API 调用
      const response = await this.executeDataAgentWithTokenRefresh(async () => {
        // 为当前流式请求创�?AbortController，便于前端在停止会话时主动中断连�?
        const controller = new AbortController();
        // ChatKitBase 中定义了 currentStreamController，向下转型后直接赋�?
        (this as any).currentStreamController = controller;

        const res = await fetch(
          `${this.dipBaseUrl}/app/${this.dipKey}/chat/completion`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              Authorization: `Bearer ${this.dipToken}`,
              'x-business-domain': this.dipBusinessDomain,
            },
            signal: controller.signal,
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          const error: any = new Error(`DIP API 调用失败: ${res.status} ${errText}`);
          error.status = res.status;
          error.body = errText;
          throw error;
        }

        return res;
      });

      // 如果是重新生成，使用现有的消�?ID；否则创建新的消�?ID
      const assistantMessageId = regenerateMessageId || `assistant-${Date.now()}`;
      const initialAssistantMessage: ChatMessage = {
        messageId: assistantMessageId,
        content: [],
        role: {
          name: 'AI 助手',
          type: RoleType.ASSISTANT,
          avatar: '',
        },
      };

      // 使用 any 类型断言来访�?setState 方法
      if (regenerateMessageId) {
        // 重新生成：更新现有消�?
        (this as any).setState((prevState: any) => {
          const messages = prevState.messages.map((msg: ChatMessage) => {
            if (msg.messageId === regenerateMessageId) {
              return initialAssistantMessage;
            }
            return msg;
          });
          return {
            messages,
            streamingMessageId: assistantMessageId,
          };
        });
      } else {
        // 新建消息：添加到消息列表
        (this as any).setState((prevState: any) => ({
          messages: [...prevState.messages, initialAssistantMessage],
          streamingMessageId: assistantMessageId,
        }));
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取流式响应');
      }

      // 记录流式开始时间，用于计算本次回答耗时
      const startTime = Date.now();

      // 处理流式响应（在流式过程中按白名单增量更新消息与内容块）
      await (this as any).handleStreamResponse(reader, assistantMessageId);

      // �?state 中获取最终更新后的消�?
      // 优先使用 streamingMessageId（可能已�?assistant_message_id 更新），否则使用初始�?assistantMessageId
      const currentStreamingMessageId = (this as any).state.streamingMessageId || assistantMessageId;

      // 计算耗时（秒），并写入当前助手消息的 messageContext（作为兜底；优先使用后端�?total_time�?
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      if (elapsedSeconds >= 0 && Number.isFinite(elapsedSeconds)) {
        try {
          if (typeof (this as any).updateMessageContext === 'function') {
            (this as any).updateMessageContext(currentStreamingMessageId, {
              // 若后端通过 message.ext.total_time 下发了更精确的耗时，后续白名单逻辑会覆盖该�?
              elapsedSeconds,
            });
          }
        } catch {
          // 写入统计信息失败时静默处理，避免影响主流�?
        }
      }

      const finalMessage = (this as any).state.messages.find((msg: any) => msg.messageId === currentStreamingMessageId);

      return finalMessage || initialAssistantMessage;
    }

  /**
   * �?API 接口返回�?EventStream 增量解析成完整的 AssistantMessage 对象
   * 根据设计文档实现白名单机制和 JSONPath 处理
   * 
   * 处理流程（符合文档流程图）：
   * 1. 解析 EventMessage
   * 2. 检�?AssistantMessage 实例是否已经存在
   * 3. 如果不存在且 key 包含 assistant_message，则初始�?AssistantMessage 对象
   * 4. 检�?action �?JSONPath 是否在白名单�?
   * 5. 如果在白名单中，根据 action 处理 content 并执行后处理
   * 6. 处理完成后，检�?AssistantMessage.message.id 并同步更�?ChatMessage.messageId
   *    保证 AssistantMessage.id �?ChatMessage.messageId 保持一�?
   * 
   * @param eventMessage 接收到的一�?Event Message
   * @param prev 上一次增量更新后�?AssistantMessage 对象
   * @param messageId 当前正在更新的消�?ID
   * @returns 返回更新后的 AssistantMessage 对象
   */
  public reduceAssistantMessage<T = any, K = any>(eventMessage: T, prev: K, messageId: string): K {
    try {
      // 解析 EventMessage
      const parsed = typeof eventMessage === 'string' ? JSON.parse(eventMessage) : eventMessage;
      const em = this.parseEventMessage(parsed);

      // 如果 action �?'end'，直接返�?
      if (em.action === 'end') {
        return prev;
      }

      // 检�?key 是否包含 assistant_message，如果包含且 AssistantMessage 实例不存在，则初始化
      // 根据文档流程图：如果 key 包含 assistant_message，且 AssistantMessage 实例不存在，则初始化
      const key = em.key || [];
      const hasAssistantMessage = key.some(k => 
        typeof k === 'string' && (k === 'assistant_message' || k.startsWith('assistant_message'))
      );
      
      // 初始化或按路径不可变更新，避免每事件全量深拷贝（大对象时会导致卡顿）
      const isInit = hasAssistantMessage && (!prev || Object.keys(prev as any).length === 0);
      const base = isInit ? ({} as AssistantMessage) : (prev || {}) as AssistantMessage;
      let assistantMessage: AssistantMessage;
      if (em.action === 'upsert') {
        assistantMessage = this.immutableApplyUpsert(base, key, em.content);
      } else if (em.action === 'append') {
        assistantMessage = this.immutableApplyAppend(base, key, em.content);
      } else {
        assistantMessage = base;
      }

      // 检查是否在白名单中
      const jsonPath = this.keyToJSONPath(key);
      const whitelistEntry = this.getWhitelistEntry(em.action || '', jsonPath);

      if (!whitelistEntry) {
        // 不在白名单中，跳过处理，但仍需检查并同步更新 messageId
        const processedAssistantMessage = assistantMessage;
        
        const assistantMessageId = processedAssistantMessage.message?.id;
        if (assistantMessageId && assistantMessageId !== messageId) {
          (this as any).applyStreamingUpdate((prevState: any) => {
            const messages = prevState.messages.map((msg: ChatMessage) => {
              if (msg.messageId === messageId) {
                return {
                  ...msg,
                  messageId: assistantMessageId,
                };
              }
              return msg;
            });
            return {
              messages,
              streamingMessageId: assistantMessageId,
            };
          });
        }

        return processedAssistantMessage as K;
      }

      // assistantMessage 已在上面通过不可变更新得到，此处无需再次 apply

      // 保证 AssistantMessage.message.id �?ChatMessage.messageId 保持一�?
      // 在处理完 AssistantMessage 后，检查并同步更新 ChatMessage.messageId
      // 优先使用 AssistantMessage.message.id，确保后�?postProcess 使用正确�?messageId
      const assistantMessageId = assistantMessage.message?.id;
      let currentMessageId = messageId;
      
      if (assistantMessageId && assistantMessageId !== messageId) {
        currentMessageId = assistantMessageId; // 使用新的 messageId
        // 更新 state 中的消息 ID �?streamingMessageId（流式期间走批处理，避免 Maximum update depth exceeded�?
        (this as any).applyStreamingUpdate((prevState: any) => {
          const messages = prevState.messages.map((msg: ChatMessage) => {
            if (msg.messageId === messageId) {
              return {
                ...msg,
                messageId: assistantMessageId,
              };
            }
            return msg;
          });
          return {
            messages,
            streamingMessageId: assistantMessageId,
          };
        });
      }

      // 执行后处理，使用更新后的 messageId（优先使�?AssistantMessage.message.id�?
      // 这样可以确保 append*Block 方法能找到正确的消息
      if (whitelistEntry.postProcess) {
        // 注意：postProcess 现在仅用于写�?messageContext（相关问题、耗时、Token 等）
        // 工具�?LLM 内容块的渲染统一在流式结束后基于完整 AssistantMessage 处理
        whitelistEntry.postProcess(assistantMessage, em.content, currentMessageId);
      }

      // 兜底：按设计文档 3.2 白名单，total_tokens 仅从 message.ext.total_tokens 获取（已�?upsert 写入�?
      try {
        const msg: any = assistantMessage && (assistantMessage as any).message;
        const totalTokens =
          msg?.ext != null && typeof msg.ext.total_tokens === 'number'
            ? msg.ext.total_tokens
            : undefined;
        if (totalTokens != null && typeof (this as any).updateMessageContext === 'function') {
          (this as any).updateMessageContext(currentMessageId, {
            totalTokens,
          });
        }
      } catch {
        // 静默处理，避免影响主流程
      }

      return assistantMessage as K;
    } catch (e) {
      return prev;
    }
  }

  /**
   * 解析原始事件�?EventMessage
   */
  public parseEventMessage(raw: any): EventMessage {
    // �?SSE data 中提�?
    if (raw.data) {
      const dataStr = typeof raw.data === 'string' ? raw.data : JSON.stringify(raw.data);
      try {
        const parsed = JSON.parse(dataStr);
        return {
          seq_id: parsed.seq_id || parsed.seq,
          key: parsed.key,
          action: parsed.action,
          content: parsed.content,
        };
      } catch {
        return raw;
      }
    }

    return {
      seq_id: raw.seq_id || raw.seq,
      key: raw.key,
      action: raw.action,
      content: raw.content,
    };
  }

  /**
   * �?key 数组转换�?JSONPath 字符�?
   * 例如: ["message", "content", "middle_answer", "progress", 0]
   * => "message.content.middle_answer.progress[0]"
   */
  public keyToJSONPath(key: Array<string | number>): string {
    return key.map((k, index) => {
      if (typeof k === 'number') {
        return `[${k}]`;
      }
      return index === 0 ? k : `.${k}`;
    }).join('').replace(/\.\[/g, '[');
  }

  /**
   * 白名单定�?
   * 根据设计文档 3.2 Event Message 白名�?
   *
   * 注意：postProcess 方法需要调�?appendMarkdownBlock �?appendWebSearchBlock
   * 这些方法需要在子类中实�?
   */
  public getWhitelistEntry(action: string, jsonPath: string): {
    postProcess?: (assistantMessage: AssistantMessage, content: any, messageId: string) => void;
  } | null {
    const entries: {
      [key: string]: {
        postProcess?: (assistantMessage: AssistantMessage, content: any, messageId: string) => void
      }
    } = {
      'upsert:error': {},
      'upsert:message': {},
      // 相关推荐问题：写�?message.ext.related_queries
      'upsert:message.ext.related_queries': {
        postProcess: (_assistantMessage, content, messageId) => {
          const questions = Array.isArray(content) ? content.filter((q) => typeof q === 'string' && q.trim().length > 0) : [];
          if (!questions.length) return;
          try {
            if (typeof (this as any).updateMessageContext === 'function') {
              (this as any).updateMessageContext(messageId, {
                relatedQuestions: questions,
              });
            }
          } catch {
            // 静默失败，避免影响主流程
          }
        },
      },
      // 总耗时：message.ext.total_time（单位：秒）
      'upsert:message.ext.total_time': {
        postProcess: (_assistantMessage, content, messageId) => {
          const elapsedSeconds = typeof content === 'number' ? content : undefined;
          if (elapsedSeconds == null) return;
          try {
            if (typeof (this as any).updateMessageContext === 'function') {
              (this as any).updateMessageContext(messageId, {
                elapsedSeconds,
              });
            }
          } catch {
            // 静默失败
          }
        },
      },
      // Token 总数：仅按设计文�?3.2 白名单，通过 upsert message.ext.total_tokens 获取（content 为数字或�?total_tokens 的对象）
      'upsert:message.ext.total_tokens': {
        postProcess: (_assistantMessage, content, messageId) => {
          const totalTokens =
            typeof content === 'number'
              ? content
              : content && typeof content.total_tokens === 'number'
                ? content.total_tokens
                : undefined;
          if (totalTokens == null) return;
          try {
            if (typeof (this as any).updateMessageContext === 'function') {
              (this as any).updateMessageContext(messageId, {
                totalTokens,
              });
            }
          } catch {
            // 静默失败
          }
        },
      },
      // 注意：upsert:assistant_message_id 的处理已移除
      // 现在通过检�?AssistantMessage.message.id 来同步更�?ChatMessage.messageId
      // 这样可以保证 AssistantMessage.id �?ChatMessage.messageId 保持一�?
      'append:message.content.middle_answer.progress': {
        postProcess: (_assistantMessage, content, messageId) => {
          // content 是一�?Progress 对象
          if (content?.stage === 'skill') {
            // 某些内部技能（�?show_ds）不展示
            if (content.skill_info?.args?.some((item: any) => item?.name === 'action' && item?.value === 'show_ds')) {
              return;
            }

            // Web 搜索工具：流式期间追�?WebSearchBlock
            if (content.skill_info?.name === 'zhipu_search_tool') {
              const searchQuery = this.extractWebSearchQuery(content);
              if (searchQuery) {
                (this as any).appendWebSearchBlock(messageId, searchQuery);
              }
            }

            // Json2Plot 工具：首帧或中间帧根据当�?answer 解析图表并渲�?
            if (content.skill_info?.name === 'json2plot') {
              const chartData = this.extractChartDataFromArgs(content.skill_info?.args, content.answer);
              if (chartData) {
                const consumeTime = this.calculateConsumeTime(content.start_time, content.end_time);
                (this as any).appendJson2PlotBlock(messageId, chartData, consumeTime);
              }
            }

            // DatasourceFilter 工具：首帧或中间帧根据当�?answer 解析并渲�?
            if (content.skill_info?.name === 'datasource_filter') {
              const datasourceFilterResult = this.extractDatasourceFilterResult(content.skill_info?.args, content.answer);
              if (datasourceFilterResult) {
                const consumeTime = this.calculateConsumeTime(content.start_time, content.end_time);
                (this as any).appendDatasourceFilterBlock(messageId, datasourceFilterResult, consumeTime);
              }
            }

            // DatasourceRerank 工具：首帧或中间帧根据当�?answer 解析并渲�?
            if (content.skill_info?.name === 'datasource_rerank') {
              const datasourceRerankResult = this.extractDatasourceRerankResult(content.skill_info?.args, content.answer);
              if (datasourceRerankResult) {
                const consumeTime = this.calculateConsumeTime(content.start_time, content.end_time);
                (this as any).appendDatasourceRerankBlock(messageId, datasourceRerankResult, consumeTime);
              }
            }

            // search_memory / _date / build_memory 等工具默认不展示
            const skillNameLower = content.skill_info?.name?.toLowerCase();
            if (
              skillNameLower === 'search_memory' ||
              skillNameLower === '_date' ||
              skillNameLower === 'build_memory'
            ) {
              return;
            }
          } else if (content?.stage === 'llm') {
            // LLM 阶段，输�?answer（流�?Markdown�?
            const answer = content.answer || '';
            (this as any).appendMarkdownBlock(messageId, answer);
          }

          // 兜底：走通用的技�?/ LLM 处理逻辑，保证所有白名单内工具都参与流式组装
          this.processMiddleAnswerProgress(content, messageId);
        },
      },
    };

    // 对于数组索引和子字段的情况，使用正则匹配
    const progressArrayPattern = /^message\.content\.middle_answer\.progress\[\d+\]$/;
    const progressArrayAnswerPattern = /^message\.content\.middle_answer\.progress\[\d+\]\.answer$/;
    // 流式工具（如 contextloader_data_enhanced）通过 append progress[N].answer.answer 下发片段，需用已组装结果更新工具�?
    const progressAnswerAnswerPattern = /^message\.content\.middle_answer\.progress\[(\d+)\]\.answer\.answer$/;
    // 流式工具整块 upsert progress[N].answer 时，用最�?answer 更新工具�?
    const progressAnswerUpsertPattern = /^message\.content\.middle_answer\.progress\[(\d+)\]\.answer$/;

    if (action === 'append' && progressArrayPattern.test(jsonPath)) {
      return entries['append:message.content.middle_answer.progress'];
    }

    if (action === 'append' && progressArrayAnswerPattern.test(jsonPath)) {
      return {
        postProcess: (assistantMessage, _content, messageId) => {
          // 提取最后一�?progress �?answer，流式补�?Markdown
          const progress = assistantMessage.message?.content?.middle_answer?.progress || [];
          if (progress.length > 0) {
            const lastProgress = progress[progress.length - 1];
            if (lastProgress.stage === 'llm') {
              const answer = lastProgress.answer || '';
              (this as any).appendMarkdownBlock(messageId, answer);
            }
          }
        },
      };
    }

    // 流式工具 answer 的字符串追加：用当前 progress[N] 的完�?answer 更新对应工具块，保证最终是流式组装后的数据
    const progressAnswerAnswerMatch = action === 'append' && jsonPath.match(progressAnswerAnswerPattern);
    if (progressAnswerAnswerMatch) {
      const progressIndex = parseInt(progressAnswerAnswerMatch[1], 10);
      return {
        postProcess: (assistantMessage, _content, messageId) => {
          const progress = assistantMessage.message?.content?.middle_answer?.progress || [];
          const item = progress[progressIndex];
          if (item?.stage === 'skill' && item?.skill_info) {
            const defaultTool = this.buildDefaultToolResult(item.skill_info, item.answer);
            if (defaultTool) {
              (this as any).updateDefaultToolBlockResult(messageId, defaultTool.toolName, defaultTool.result);
            }
          }
        },
      };
    }

    // 流式工具整块 upsert progress[N].answer 时，用最�?answer 更新工具�?
    const progressAnswerUpsertMatch = action === 'upsert' && jsonPath.match(progressAnswerUpsertPattern);
    if (progressAnswerUpsertMatch) {
      const progressIndex = parseInt(progressAnswerUpsertMatch[1], 10);
      return {
        postProcess: (assistantMessage, _content, messageId) => {
          const progress = assistantMessage.message?.content?.middle_answer?.progress || [];
          const item = progress[progressIndex];
          if (item?.stage === 'skill' && item?.skill_info && item.answer != null) {
            const skillName = item.skill_info.name;

            // 专门处理 json2plot 工具：用最新的 answer 解析图表数据并更�?JSON2Plot �?
            if (skillName === 'json2plot') {
              const chartData = this.extractChartDataFromArgs(item.skill_info?.args, item.answer);
              if (chartData) {
                const consumeTime = this.calculateConsumeTime(item.start_time, item.end_time);
                (this as any).updateJson2PlotBlock(messageId, chartData, consumeTime);
              }
              return;
            }

            // 专门处理 datasource_filter 工具：用最新的 answer 解析并更�?DatasourceFilter �?

            if (skillName === 'web_processor') {
              const webProcessorData = this.extractWebProcessorData(item.answer);
              if (webProcessorData) {
                const consumeTime = this.calculateConsumeTime(item.start_time, item.end_time);
                (this as any).updateWebProcessorBlock(messageId, webProcessorData, consumeTime);
              }
              return;
            }
            if (skillName === 'datasource_filter') {
              const datasourceFilterResult = this.extractDatasourceFilterResult(item.skill_info?.args, item.answer);
              if (datasourceFilterResult) {
                const consumeTime = this.calculateConsumeTime(item.start_time, item.end_time);
                (this as any).updateDatasourceFilterBlock(messageId, datasourceFilterResult, consumeTime);
              }
              return;
            }

            // 专门处理 datasource_rerank 工具：用最新的 answer 解析并更�?DatasourceRerank �?
            if (skillName === 'datasource_rerank') {
              const datasourceRerankResult = this.extractDatasourceRerankResult(item.skill_info?.args, item.answer);
              if (datasourceRerankResult) {
                const consumeTime = this.calculateConsumeTime(item.start_time, item.end_time);
                (this as any).updateDatasourceRerankBlock(messageId, datasourceRerankResult, consumeTime);
              }
              return;
            }

            // 其他走默认工具块的技能：统一�?DefaultToolResult 更新/创建工具�?
            const defaultTool = this.buildDefaultToolResult(item.skill_info, item.answer);
            if (defaultTool) {
              (this as any).updateDefaultToolBlockResult(messageId, defaultTool.toolName, defaultTool.result);
            }
          }
        },
      };
    }

    // 设计文档 3.2 白名单仅规定通过 upsert message.ext.total_tokens 获取 total_tokens，不处理其他 token_usage 路径

    const key = `${action}:${jsonPath}`;
    return entries[key] || null;
  }

  /**
   * 在流式结束后，将完整�?AssistantMessage 结构一次性应用到指定 ChatMessage�?
   * - 遍历 middle_answer.progress，按顺序调用 appendSkillOrLLMContentToMessage 组装所有工具和 LLM 内容�?
   * - 基于 message.ext 同步 messageContext（相关问题、耗时、Token 等），与历史会话逻辑保持一�?
   *
   * 作为受保护方法暴露，便于子类在特殊场景下自定义流式结果的应用逻辑�?
   */
  applyAssistantMessageFromStream(assistantMessage: AssistantMessage, messageId: string): void {
    if (!assistantMessage || !assistantMessage.message) return;

    const contentObj: any = assistantMessage.message.content || {};
    const middleAnswer = contentObj.middle_answer;
    const ext: any = (assistantMessage as any).message?.ext;

    // 统一通过 applyStreamingUpdate 更新指定消息，避免与其他流式更新冲突
    (this as any).applyStreamingUpdate((prevState: any) => {
      const newMessages = prevState.messages.map((msg: ChatMessage) => {
        if (msg.messageId !== messageId) return msg;

        // 从现有消息复制基础信息，但重建 content
        const nextMsg: ChatMessage = {
          ...msg,
          content: [],
        };

        // 1. 按顺序处�?middle_answer.progress 数组，组装所有工具和 LLM 内容�?
        if (middleAnswer?.progress && Array.isArray(middleAnswer.progress)) {
          for (const progressItem of middleAnswer.progress) {
            this.appendSkillOrLLMContentToMessage(progressItem as any, nextMsg);
          }
        }

        // 2. 基于 message.ext 写入 messageContext（与 getConversationMessages 保持一致）
        if (ext && typeof ext === 'object') {
          const relatedQuestions = Array.isArray(ext.related_queries)
            ? (ext.related_queries as string[]).filter(
                (q: string) => typeof q === 'string' && q.trim().length > 0
              )
            : undefined;
          const elapsedSeconds =
            typeof ext.total_time === 'number' && Number.isFinite(ext.total_time)
              ? ext.total_time
              : undefined;
          const totalTokens =
            typeof ext.total_tokens === 'number' && Number.isFinite(ext.total_tokens)
              ? ext.total_tokens
              : ext.token_usage && typeof (ext.token_usage as any).total_tokens === 'number'
                ? (ext.token_usage as any).total_tokens
                : undefined;

          if (relatedQuestions?.length || elapsedSeconds != null || totalTokens != null) {
            nextMsg.messageContext = {
              ...(relatedQuestions?.length ? { relatedQuestions } : {}),
              ...(elapsedSeconds != null ? { elapsedSeconds } : {}),
              ...(totalTokens != null ? { totalTokens } : {}),
            };
          }
        }

        return nextMsg;
      });

      return { messages: newMessages };
    });
  }

  /**
   * �?Progress 对象中提�?Web 搜索查询
   * 根据 OpenAPI 规范，搜索数据在 answer.choices[0].message.tool_calls �?
   * tool_calls[0] �?SearchIntent（输入），tool_calls[1] �?SearchResult（输出）
   */
  public extractWebSearchQuery(progress: any): WebSearchQuery | null {
    try {
      // �?answer.choices[0].message.tool_calls 中提取数�?
      const toolCalls = progress?.answer?.choices?.[0]?.message?.tool_calls;

      if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length < 2) {
        return null;
      }

      // tool_calls[0] �?SearchIntent（输入）
      const searchIntentObj = toolCalls[0];

      // search_intent 是一个数组，取第一个元�?
      const searchIntentArray = searchIntentObj?.search_intent;
      const searchIntent = Array.isArray(searchIntentArray) ? searchIntentArray[0] : searchIntentArray;

      const query = searchIntent?.query || searchIntent?.keywords || '';

      // tool_calls[1] �?SearchResult（输出）
      const searchResultObj = toolCalls[1];

      const searchResultArray = searchResultObj?.search_result;

      if (!searchResultArray || !Array.isArray(searchResultArray)) {
        return null;
      }

      const results: WebSearchResult[] = searchResultArray.map((item: any) => ({
        content: item.content || '',
        icon: item.icon || '',
        link: item.link || '',
        media: item.media || '',
        title: item.title || '',
      }));

      return {
        input: query,
        results,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * �?Progress 对象中提�?Json2Plot 图表数据
   * 根据 OpenAPI 规范，Json2Plot 数据�?answer.choices[0].message.tool_calls �?
   * tool_calls 中包�?Json2PlotAnswer，格式为 { result: Json2PlotResult, full_result: Json2PlotFullResult }
   * Json2PlotResult 包含: data_sample, chart_config, title, text
   * Json2PlotFullResult 包含: data, chart_config, title, text
   * ChartConfig 包含: xField, yField, seriesField, chart_type, groupField, isStack, isGroup
   */
  public extractJson2PlotData(progress: any): ChartDataSchema | null {
    try {
      // �?answer.choices[0].message.tool_calls 中提取数�?
      const toolCalls = progress?.answer?.choices?.[0]?.message?.tool_calls;

      if (!toolCalls || !Array.isArray(toolCalls)) {
        return null;
      }

      // 查找 Json2PlotAnswer（包�?result �?full_result 的对象）
      let json2PlotAnswer: any = null;
      for (const toolCall of toolCalls) {
        if (toolCall?.result || toolCall?.full_result) {
          json2PlotAnswer = toolCall;
          break;
        }
      }

      if (!json2PlotAnswer) {
        return null;
      }

      // 优先使用 full_result，如果没有则使用 result
      const json2PlotData = json2PlotAnswer.full_result || json2PlotAnswer.result;
      
      if (!json2PlotData) {
        return null;
      }

      const chartConfig = json2PlotData.chart_config;
      if (!chartConfig || !chartConfig.chart_type) {
        return null;
      }

      // 验证 chart_type 是否为有效�?
      const validChartTypes = ['Line', 'Column', 'Pie', 'Circle'];
      const chartType = chartConfig.chart_type;
      if (!validChartTypes.includes(chartType)) {
        return null;
      }

      // 获取数据行（优先使用 full_result.data，否则使�?result.data_sample�?
      const dataRows = json2PlotData.data || json2PlotData.data_sample || [];
      
      if (!Array.isArray(dataRows) || dataRows.length === 0) {
        return null;
      }

      // 从数据行中推断字段类�?
      const firstRow = dataRows[0];
      if (!firstRow || typeof firstRow !== 'object') {
        return null;
      }

      // 构建 dimensions（维度字段）
      const dimensions: Array<{ name: string; displayName: string; dataType: 'string' | 'number' | 'date' | 'boolean' }> = [];
      
      // xField 作为第一个维�?
      if (chartConfig.xField && firstRow[chartConfig.xField] !== undefined) {
        const value = firstRow[chartConfig.xField];
        const dataType = this.inferDataType(value);
        dimensions.push({
          name: chartConfig.xField,
          displayName: chartConfig.xField,
          dataType,
        });
      }

      // groupField 作为维度（如果存在）
      if (chartConfig.groupField && 
          chartConfig.groupField !== chartConfig.xField &&
          firstRow[chartConfig.groupField] !== undefined) {
        const value = firstRow[chartConfig.groupField];
        const dataType = this.inferDataType(value);
        dimensions.push({
          name: chartConfig.groupField,
          displayName: chartConfig.groupField,
          dataType,
        });
      }

      // seriesField 作为维度（如果存在且不是xField和groupField�?
      // seriesField 通常用于创建多个系列，应该作为维�?
      if (chartConfig.seriesField && 
          chartConfig.seriesField !== chartConfig.xField && 
          chartConfig.seriesField !== chartConfig.groupField &&
          firstRow[chartConfig.seriesField] !== undefined) {
        const value = firstRow[chartConfig.seriesField];
        const dataType = this.inferDataType(value);
        dimensions.push({
          name: chartConfig.seriesField,
          displayName: chartConfig.seriesField,
          dataType,
        });
      }

      // 构建 measures（度量字段）
      const measures: Array<{ name: string; displayName: string; dataType: 'number' | 'string'; aggregation?: 'sum' | 'avg' | 'count' | 'max' | 'min' }> = [];
      
      // yField 作为第一个度�?
      if (chartConfig.yField && firstRow[chartConfig.yField] !== undefined) {
        measures.push({
          name: chartConfig.yField,
          displayName: chartConfig.yField,
          dataType: 'number',
        });
      }

      // 如果没有找到任何维度或度量，尝试从数据中推断
      if (dimensions.length === 0 || measures.length === 0) {
        // 遍历所有字段，推断类型
        const fieldTypes = new Map<string, 'string' | 'number' | 'date' | 'boolean'>();
        
        for (const [key, value] of Object.entries(firstRow)) {
          if (value !== null && value !== undefined) {
            fieldTypes.set(key, this.inferDataType(value));
          }
        }

        // 如果缺少维度，使用第一个非数值字�?
        if (dimensions.length === 0) {
          for (const [key, dataType] of fieldTypes.entries()) {
            if (dataType !== 'number' && !measures.find(m => m.name === key)) {
              dimensions.push({
                name: key,
                displayName: key,
                dataType,
              });
              break;
            }
          }
        }

        // 如果缺少度量，使用第一个数值字�?
        if (measures.length === 0) {
          for (const [key, dataType] of fieldTypes.entries()) {
            if (dataType === 'number' && !dimensions.find(d => d.name === key)) {
              measures.push({
                name: key,
                displayName: key,
                dataType: 'number',
              });
              break;
            }
          }
        }
      }

      // 验证是否成功构建�?dimensions �?measures
      if (dimensions.length === 0 || measures.length === 0) {
        return null;
      }

      // 构�?ChartDataSchema
      const chartData: ChartDataSchema = {
        chartType: chartType as 'Line' | 'Column' | 'Pie' | 'Circle',
        title: json2PlotData.title,
        dimensions,
        measures,
        rows: dataRows,
      };

      return chartData;
    } catch (e) {
      return null;
    }
  }

  /**
   * 提取 WebProcessor 数据
   */
  public extractWebProcessorData(answer: any): WebProcessorDataSchema | null {
    const answerObj = answer || {};
    const result = answerObj.result || answerObj.full_result || answerObj;
    const url = typeof result?.url === 'string' ? result.url : '';

    if (!url) {
      return null;
    }

    const title =
      (typeof result?.title === 'string' && result.title) ||
      (typeof answerObj?.title === 'string' && answerObj.title) ||
      undefined;

    const size = Array.isArray(result?.size) &&
      result.size.length >= 2 &&
      Number.isFinite(Number(result.size[0])) &&
      Number.isFinite(Number(result.size[1]))
      ? [Number(result.size[0]), Number(result.size[1])] as [number, number]
      : undefined;

    return {
      ...(title ? { title } : {}),
      url,
      ...(size ? { size } : {}),
    };
  }  /**
   * 推断数据类型
   */
  public inferDataType(value: any): 'string' | 'number' | 'date' | 'boolean' {
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'string') {
      // 尝试解析日期
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return 'date';
      }
      return 'string';
    }
    return 'string';
  }

  /**
   * 计算耗时（毫秒）
   * @param startTime 开始时间戳
   * @param endTime 结束时间�?
   * @returns 耗时（毫秒），如果时间戳无效则返�?undefined
   */
  public calculateConsumeTime(startTime?: number, endTime?: number): number | undefined {
    if (startTime && endTime && endTime > startTime) {
      return Math.round((endTime - startTime) * 1000); // 转换为毫秒并四舍五入
    }
    return undefined;
  }

  /**
   * 处理技能调用的统一方法
   * 根据设计文档 3.2 Event Message 白名单中的后处理逻辑
   * @param skillInfo 技能信�?
   * @param answer 技能执行的 answer 字段
   * @param messageId 消息 ID
   * @param consumeTime 耗时（毫秒），可�?
   */
  public processSkillExecution(skillInfo: SkillInfo | undefined, answer: any, messageId: string, consumeTime?: number): void {
    if (!skillInfo?.name) {
      return;
    }

    const skillName = skillInfo.name;
    const skillNameLower = skillName.toLowerCase();

    // 处理 search_memory, _date, build_memory 技�?
    if (skillNameLower === 'search_memory' || skillNameLower === '_date' || skillNameLower === 'build_memory') {
      // 这些技能默认不显示调用信息，或者根据需求进行特定处�?
      // 如果需要显示，可以添加相应的渲染逻辑
      return;
    }

    if (skillName === 'zhipu_search_tool') {
      // Web 搜索工具
      const searchQuery = this.extractWebSearchQueryFromAnswer(answer);
      if (searchQuery) {
        (this as any).appendWebSearchBlock(messageId, searchQuery);
      }
    } else if (skillName === 'web_processor') {
      const webProcessorData = this.extractWebProcessorData(answer);
      if (webProcessorData) {
        (this as any).appendWebProcessorBlock(messageId, webProcessorData, consumeTime);
      }
    } else if (skillName === 'json2plot') {
      // json2plot 工具：将 skill_info.args �?answer 解析�?ChartDataSchema 结构并输出到界面
      const chartData = this.extractChartDataFromArgs(skillInfo.args, answer);
      if (chartData) {
        (this as any).appendJson2PlotBlock(messageId, chartData, consumeTime);
      }
    } else if (skillName === 'execute_code') {
      // 代码执行工具：解析代码输入和输出
      const executeCodeResult = this.extractExecuteCodeResult(skillInfo.args, answer);
      if (executeCodeResult) {
        (this as any).appendExecuteCodeBlock(messageId, executeCodeResult, consumeTime);
      }
    } else if (skillName === 'text2sql') {
      // Text2SQL 工具：解析查询输入、SQL 语句和执行结�?
      const text2SqlResult = this.extractText2SqlResult(skillInfo.args, answer);
      if (text2SqlResult) {
        (this as any).appendText2SqlBlock(messageId, text2SqlResult, consumeTime);
      }
    } else if (skillName === 'text2metric') {
      // Text2Metric 工具：解析查询输入和指标数据
      const text2MetricResult = this.extractText2MetricResult(skillInfo.args, answer);
      if (text2MetricResult) {
        (this as any).appendText2MetricBlock(messageId, text2MetricResult, consumeTime);
      }
    } else if (skillName === 'af_sailor') {
      // AfSailor 工具：解析找数查询结�?
      const afSailorResult = this.extractAfSailorResult(skillInfo.args, answer);
      if (afSailorResult) {
        (this as any).appendAfSailorBlock(messageId, afSailorResult, consumeTime);
      }
    } else if (skillName === 'datasource_filter') {
      // DatasourceFilter 工具：解析数据源过滤结果
      const datasourceFilterResult = this.extractDatasourceFilterResult(skillInfo.args, answer);
      if (datasourceFilterResult) {
        (this as any).appendDatasourceFilterBlock(messageId, datasourceFilterResult, consumeTime);
      }
    } else if (skillName === 'datasource_rerank') {
      // DatasourceRerank 工具：解析数据源重排结果，与 datasource_filter 处理方式一�?
      console.log(skillInfo, skillInfo.args, answer, 'datasource_rerank')
      const datasourceRerankResult = this.extractDatasourceRerankResult(skillInfo.args, answer);
      if (datasourceRerankResult) {
        (this as any).appendDatasourceRerankBlock(messageId, datasourceRerankResult, consumeTime);
      }
    } else {
      // 默认工具处理逻辑：没有特殊处理的工具统一�?DefaultTool
      const defaultTool = this.buildDefaultToolResult(skillInfo, answer);
      if (defaultTool) {
        (this as any).appendDefaultToolBlock(
          messageId,
          defaultTool.toolName,
          defaultTool.result,
          consumeTime,
        );
      }
    }
  }


  /**
   * 处理 middle_answer.progress 中的一个元�?
   * 根据设计文档 3.2 Event Message 白名单中的后处理逻辑
   * @param content Progress 对象
   * @param messageId 消息 ID
   */
  public processMiddleAnswerProgress(content: Progress, messageId: string): void {
    if (content?.stage === 'skill') {
      const consumeTime = this.calculateConsumeTime(content.start_time, content.end_time);
      this.processSkillExecution(content.skill_info, content.answer, messageId, consumeTime);
    } else if (content?.stage === 'llm') {
      // LLM 阶段，输�?answer
      const answer = content.answer || '';
      (this as any).appendMarkdownBlock(messageId, answer);
    }
  }

  /**
   * �?answer.choices 中提�?Web 搜索查询
   * 用于处理 middle_answer.progress 中的搜索结果
   */
  public extractWebSearchQueryFromAnswer(answer: any): WebSearchQuery | null {
    try {
      const toolCalls = answer?.choices?.[0]?.message?.tool_calls;

      if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length < 2) {
        return null;
      }

      // tool_calls[0] �?SearchIntent（输入）
      const searchIntentObj = toolCalls[0];
      const searchIntentArray = searchIntentObj?.search_intent;
      const searchIntent = Array.isArray(searchIntentArray) ? searchIntentArray[0] : searchIntentArray;
      const query = searchIntent?.query || searchIntent?.keywords || '';

      // tool_calls[1] �?SearchResult（输出）
      const searchResultObj = toolCalls[1];
      const searchResultArray = searchResultObj?.search_result;

      if (!searchResultArray || !Array.isArray(searchResultArray)) {
        return null;
      }

      const results: WebSearchResult[] = searchResultArray.map((item: any) => ({
        content: item.content || '',
        icon: item.icon || '',
        link: item.link || '',
        media: item.media || '',
        title: item.title || '',
      }));

      return {
        input: query,
        results,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * �?skill_info.args �?answer 中提取图表数据并转换�?ChartDataSchema
   * 用于处理 json2plot 工具的输�?
   * @param args 技能参数数组（保留用于 API 一致性，实际数据�?answer 中提取）
   * @param answer 技能执行的 answer 字段，包�?result �?full_result
   * @returns ChartDataSchema 对象，如果解析失败则返回 null
   */
  public extractChartDataFromArgs(
    _args: Array<{name?: string; type?: string; value?: string}> | undefined,
    answer: any
  ): ChartDataSchema | null {
    try {
      // �?answer 中提取数据（优先使用 full_result，否则使�?result�?
      const json2PlotData = answer?.full_result || answer?.result;
      if (!json2PlotData) {
        return null;
      }

      const chartConfig = json2PlotData.chart_config;
      if (!chartConfig || !chartConfig.chart_type) {
        return null;
      }

      // 验证 chart_type 是否为有效�?
      const validChartTypes = ['Line', 'Column', 'Pie', 'Circle'];
      const chartType = chartConfig.chart_type;
      if (!validChartTypes.includes(chartType)) {
        return null;
      }

      // 获取数据行（优先使用 full_result.data，否则使�?result.data_sample�?
      const dataRows = json2PlotData.data || json2PlotData.data_sample || [];
      
      if (!Array.isArray(dataRows) || dataRows.length === 0) {
        return null;
      }

      // 从数据行中推断字段类�?
      const firstRow = dataRows[0];
      if (!firstRow || typeof firstRow !== 'object') {
        return null;
      }

      // 构建 dimensions（维度字段）
      const dimensions: Array<{ name: string; displayName: string; dataType: 'string' | 'number' | 'date' | 'boolean' }> = [];
      
      // xField 作为第一个维�?
      if (chartConfig.xField && firstRow[chartConfig.xField] !== undefined) {
        const value = firstRow[chartConfig.xField];
        const dataType = this.inferDataType(value);
        dimensions.push({
          name: chartConfig.xField,
          displayName: chartConfig.xField,
          dataType,
        });
      }

      // groupField 作为维度（如果存在）
      if (chartConfig.groupField && 
          chartConfig.groupField !== chartConfig.xField &&
          firstRow[chartConfig.groupField] !== undefined) {
        const value = firstRow[chartConfig.groupField];
        const dataType = this.inferDataType(value);
        dimensions.push({
          name: chartConfig.groupField,
          displayName: chartConfig.groupField,
          dataType,
        });
      }

      // seriesField 作为维度（如果存在且不是xField和groupField�?
      if (chartConfig.seriesField && 
          chartConfig.seriesField !== chartConfig.xField && 
          chartConfig.seriesField !== chartConfig.groupField &&
          firstRow[chartConfig.seriesField] !== undefined) {
        const value = firstRow[chartConfig.seriesField];
        const dataType = this.inferDataType(value);
        dimensions.push({
          name: chartConfig.seriesField,
          displayName: chartConfig.seriesField,
          dataType,
        });
      }

      // 构建 measures（度量字段）
      const measures: Array<{ name: string; displayName: string; dataType: 'number' | 'string'; aggregation?: 'sum' | 'avg' | 'count' | 'max' | 'min' }> = [];
      
      // yField 作为第一个度�?
      if (chartConfig.yField && firstRow[chartConfig.yField] !== undefined) {
        measures.push({
          name: chartConfig.yField,
          displayName: chartConfig.yField,
          dataType: 'number',
        });
      }

      // 如果没有找到任何维度或度量，尝试从数据中推断
      if (dimensions.length === 0 || measures.length === 0) {
        // 遍历所有字段，推断类型
        const fieldTypes = new Map<string, 'string' | 'number' | 'date' | 'boolean'>();
        
        for (const [key, value] of Object.entries(firstRow)) {
          if (value !== null && value !== undefined) {
            fieldTypes.set(key, this.inferDataType(value));
          }
        }

        // 如果缺少维度，使用第一个非数值字�?
        if (dimensions.length === 0) {
          for (const [key, dataType] of fieldTypes.entries()) {
            if (dataType !== 'number' && !measures.find(m => m.name === key)) {
              dimensions.push({
                name: key,
                displayName: key,
                dataType,
              });
              break;
            }
          }
        }

        // 如果缺少度量，使用第一个数值字�?
        if (measures.length === 0) {
          for (const [key, dataType] of fieldTypes.entries()) {
            if (dataType === 'number' && !dimensions.find(d => d.name === key)) {
              measures.push({
                name: key,
                displayName: key,
                dataType: 'number',
              });
              break;
            }
          }
        }
      }

      // 验证是否成功构建�?dimensions �?measures
      if (dimensions.length === 0 || measures.length === 0) {
        return null;
      }

      // 构�?ChartDataSchema
      const chartData: ChartDataSchema = {
        chartType: chartType as 'Line' | 'Column' | 'Pie' | 'Circle',
        title: json2PlotData.title,
        dimensions,
        measures,
        rows: dataRows,
      };

      return chartData;
    } catch (e) {
      return null;
    }
  }

  /**
   * �?skill_info.args �?answer 中提取代码执行结�?
   * 用于处理 execute_code 工具的输入和输出
   * @param args skill_info.args 数组，包含执行的代码
   * @param answer 技能执行的 answer 字段，包含执行结�?
   * @returns ExecuteCodeResult 对象，包�?input �?output
   */
  public extractExecuteCodeResult(
    args: Array<{name?: string; type?: string; value?: string}> | undefined,
    answer: any
  ): { input: string; output: string } | null {
    try {
      // �?args 中提取代码输�?
      let codeInput = '';
      if (args && Array.isArray(args)) {
        // 查找 name �?'code' �?'script' 的参�?
        const codeArg = args.find(arg =>
          arg.name === 'code' || arg.name === 'script' || arg.type === 'str'
        );
        codeInput = codeArg?.value || '';
      }

      // �?answer.result.result.stdout 中提取输�?
      const codeOutput = answer?.result?.result?.stdout || '执行完成';

      // 如果没有输入代码，返�?null
      if (!codeInput) {
        return null;
      }

      return {
        input: codeInput,
        output: codeOutput,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * �?skill_info.args �?answer 中提�?Text2SQL 结果
   * 用于处理 text2sql 工具的输入和输出
   * 根据 OpenAPI 规范，Text2SqlResult 包含 result �?full_result
   * - result: Text2SqlResultData（包�?data_desc，但可能只有数据样本�?
   * - full_result: Text2SqlFullResultData（包含完整数据，但没�?data_desc�?
   * 优先使用 full_result，如果没有则使用 result
   * @param args skill_info.args 数组，包含查询文�?
   * @param answer 技能执行的 answer 字段，包�?SQL 执行结果
   * @returns Text2SqlResult 对象，包�?input、sql、data 等信�?
   */
  public extractText2SqlResult(
    args: Array<{name?: string; type?: string; value?: string}> | undefined,
    answer: any
  ): { input: string; sql: string; data?: Array<Record<string, any>>; cites?: Array<{id: string; name: string; type: string; description?: string}>; title?: string; message?: string; dataDesc?: {return_records_num?: number; real_records_num?: number}; explanation?: any} | null {
    try {
      // �?args 中提取查询输�?
      let queryInput = '';
      if (args && Array.isArray(args)) {
        // 查找 name �?'input' 的参�?
        const inputArg = args.find(arg => arg.name === 'input');
        queryInput = inputArg?.value || '';
      }

      // 优先使用 full_result，如果没有则使用 result
      // 根据 schema: Text2SqlResult { result: Text2SqlResultData, full_result: Text2SqlFullResultData }
      const fullResult = answer?.full_result;
      const result = answer?.result;
      
      // 如果两者都不存在，返回 null
      if (!fullResult && !result) {
        return null;
      }

      // 优先使用 full_result，如果没有则使用 result
      const text2SqlData = fullResult || result;

      // 从数据中提取字段
      const sql = text2SqlData?.sql || '';
      const data = text2SqlData?.data || [];
      const cites = text2SqlData?.cites || [];
      const title = text2SqlData?.title || '';
      const message = text2SqlData?.message || '';
      const explanation = text2SqlData?.explanation;
      
      // data_desc 只在 result 中存在，不在 full_result �?
      const dataDesc = result?.data_desc;

      // 如果没有输入查询，返�?null
      if (!queryInput) {
        return null;
      }

      return {
        input: queryInput,
        sql,
        data: Array.isArray(data) ? data : [],
        cites: Array.isArray(cites) ? cites.map((cite: any) => ({
          id: cite.id || '',
          name: cite.name || '',
          type: cite.type || '',
          description: cite.description,
        })) : [],
        title,
        message,
        dataDesc: dataDesc ? {
          return_records_num: dataDesc.return_records_num,
          real_records_num: dataDesc.real_records_num,
        } : undefined,
        explanation,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * �?skill_info.args �?answer 中提�?Text2Metric 结果
   * 用于处理 text2metric 工具的输入和输出
   * 根据 OpenAPI 规范，Text2MetricResult 包含 result �?full_result
   * - result: Text2MetricResultData（包�?data_desc，但可能只有数据样本�?
   * - full_result: Text2MetricFullResultData（包含完整数据，但没�?data_desc�?
   * 优先使用 full_result，如果没有则使用 result
   * @param args skill_info.args 数组，包含查询参�?
   * @param answer 技能执行的 answer 字段，包含指标查询结�?
   * @returns Text2MetricResult 对象，包�?title、args、data 等信�?
   */
  public extractText2MetricResult(
    args: Array<{name?: string; type?: string; value?: string}> | undefined,
    answer: any
  ): { title: string; args: any; data?: Array<Record<string, any>> } | null {
    try {
      // 优先使用 full_result，如果没有则使用 result
      // 根据 schema: Text2MetricResult { result: Text2MetricResultData, full_result: Text2MetricFullResultData }
      const fullResult = answer?.full_result;
      const result = answer?.result;
      
      // 如果两者都不存在，返回 null
      if (!fullResult && !result) {
        return null;
      }

      // 优先使用 full_result，如果没有则使用 result
      const text2MetricData = fullResult || result;

      // 从数据中提取字段
      const title = text2MetricData?.title || '';
      const data = text2MetricData?.data || [];

      // 如果没有标题，返�?null
      if (!title) {
        return null;
      }

      return {
        title,
        args: args || [],
        data: Array.isArray(data) ? data : [],
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * �?skill_info.args �?answer 中提�?AfSailor 结果
   * 用于处理 af_sailor 工具的输入和输出
   * 根据 OpenAPI 规范，AfSailorResult 包含 result
   * - result: AfSailorResultData（包�?text、cites、result_cache_key�?
   * 根据 ChatKit.pdf，AfSailorResult 包含 data（Array<Record<string, string>>�?
   * @param _args skill_info.args 数组，包含查询参数（当前未使用，保留以保持接口一致性）
   * @param answer 技能执行的 answer 字段，包含找数查询结�?
   * @returns AfSailorResult 对象，包�?data、text、cites 等信�?
   */
  public extractAfSailorResult(
    _args: Array<{name?: string; type?: string; value?: string}> | undefined,
    answer: any
  ): { data: Array<Record<string, string>>; text?: string[]; cites?: any[]; result_cache_key?: string } | null {
    try {
      // 根据 schema: AfSailorResult { result: AfSailorResultData }
      const result = answer?.result;
      
      // 如果 result 不存在，返回 null
      if (!result) {
        return null;
      }

      // 从数据中提取字段
      const text = result?.text || [];
      const cites = result?.cites || [];
      const result_cache_key = result?.result_cache_key;

      // �?text 数组转换�?data 数组（Array<Record<string, string>>�?
      // 如果 text 是字符串数组，将其转换为对象数组
      let data: Array<Record<string, string>> = [];
      if (Array.isArray(text) && text.length > 0) {
        // 如果 text 是字符串数组，将其转换为对象数组
        // 每个字符串作为一个对象的 value
        data = text.map((item, index) => {
          if (typeof item === 'string') {
            return { value: item, index: String(index) };
          }
          return item as Record<string, string>;
        });
      }

      // 如果没有数据，返�?null
      if (data.length === 0 && (!text || text.length === 0)) {
        return null;
      }

      return {
        data,
        text: Array.isArray(text) ? text : [],
        cites: Array.isArray(cites) ? cites : [],
        result_cache_key,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * �?skill_info.args �?answer 中提�?DatasourceFilter 结果
   * 用于处理 datasource_filter 工具的输入和输出
   * 根据 OpenAPI 规范，DatasourceFilterResult 包含 result
   * - result: DatasourceFilterResultData（包�?result、result_cache_key�?
   * - result.result: DataCatalogMatch[]（数据目录匹配结果列表）
   * @param _args skill_info.args 数组，包含查询参数（当前未使用，保留以保持接口一致性）
   * @param answer 技能执行的 answer 字段，包含数据源过滤结果
   * @returns DatasourceFilterResult 对象，包�?result、result_cache_key 等信�?
   */
  public extractDatasourceFilterResult(
    _args: Array<{name?: string; type?: string; value?: string}> | undefined,
    answer: any
  ): { result: Array<any>; result_cache_key?: string } | null {
    try {
      // 根据 schema: DatasourceFilterResult { result: DatasourceFilterResultData }
      const resultData = answer?.result;
      
      // 如果 result 不存在，返回 null
      if (!resultData) {
        return null;
      }

      // 从数据中提取字段
      const result = resultData?.result || [];
      const result_cache_key = resultData?.result_cache_key;

      // 如果没有匹配结果，返�?null
      if (!Array.isArray(result) || result.length === 0) {
        return null;
      }

      return {
        result: result,
        result_cache_key,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * �?skill_info.args �?answer 中提�?DatasourceRerank 结果
   * 用于处理 datasource_rerank 工具的输入和输出，与 datasource_filter 处理方式一�?
   * 根据 OpenAPI 规范，DatasourceRerankResult 包含 result（DataCatalogMatch[]）及 result_cache_key
   * @param _args skill_info.args 数组，包含查询参数（当前未使用，保留以保持接口一致性）
   * @param answer 技能执行的 answer 字段，包含数据源重排结果
   * @returns DatasourceRerankResult 对象，包�?result、result_cache_key 等信�?
   */
  public extractDatasourceRerankResult(
    _args: Array<{name?: string; type?: string; value?: string}> | undefined,
    answer: any
  ): { result: Array<any>; result_cache_key?: string } | null {
    try {
      // 兼容多种后端返回结构�?
      // 1. �?datasource_filter 一�? answer = { result: { result: [], result_cache_key } }
      // 2. 扁平结构: answer = { result: [], result_cache_key }
      // 3. 直接数组: answer = []
      const resultSource = (answer && answer.result !== undefined) ? answer.result : answer;

      if (!resultSource) {
        return null;
      }

      const result = Array.isArray((resultSource as any).result)
        ? (resultSource as any).result
        : Array.isArray(resultSource)
          ? (resultSource as any)
          : [];

      const result_cache_key =
        (resultSource as any).result_cache_key ?? (answer as any)?.result_cache_key;

      if (!Array.isArray(result) || result.length === 0) {
        return null;
      }

      return { result, result_cache_key };
    } catch (e) {
      return null;
    }
  }

  /**
   * 将技能调用或 LLM 回答的内容追加到消息�?
   * 用于历史消息解析，根�?stage �?skill_info 将内容添加到 ChatMessage.content 数组
   * @param item Progress �?OtherTypeAnswer 对象
   * @param message ChatMessage 对象
   */
  public appendSkillOrLLMContentToMessage(
    item: Progress | OtherTypeAnswer,
    message: ChatMessage
  ): void {
    if (item.stage === 'skill') {
      // 处理技能调�?
      const skillName = item.skill_info?.name;
      const skillNameLower = skillName?.toLowerCase();
      const progressItem = item as Progress;
      const consumeTime = this.calculateConsumeTime(progressItem.start_time, progressItem.end_time);

      if(item.skill_info?.args?.some((item: any) => item?.name === 'action' && item?.value === 'show_ds')){
        return;
      }

      // 处理 search_memory, _date, build_memory 技�?
      if (skillNameLower === 'search_memory' || skillNameLower === '_date' || skillNameLower === 'build_memory') {
        // 这些技能默认不显示调用信息，或者根据需求进行特定处�?
        // 如果需要显示，可以添加相应的渲染逻辑
        return;
      }

      if (skillName === 'zhipu_search_tool') {
        // Web 搜索
        const searchQuery = this.extractWebSearchQueryFromAnswer(item.answer);
        if (searchQuery) {
          message.content.push({
            type: BlockType.WEB_SEARCH,
            content: searchQuery,
          });
        }
      } else if (skillName === 'web_processor') {
        const webProcessorData = this.extractWebProcessorData(item.answer);
        if (webProcessorData) {
          message.content.push({
            type: BlockType.WEB_PROCESSOR,
            content: webProcessorData,
            consumeTime,
          });
        }
      } else if (skillName === 'json2plot') {
        // json2plot 工具
        const chartData = this.extractChartDataFromArgs(item.skill_info?.args, item.answer);
        if (chartData) {
          message.content.push({
            type: BlockType.JSON2PLOT,
            content: chartData,
            consumeTime,
          });
        }
      } else if (skillName === 'execute_code') {
        // 代码执行工具
        const executeCodeResult = this.extractExecuteCodeResult(item.skill_info?.args, item.answer);
        if (executeCodeResult) {
          message.content.push({
            type: BlockType.TOOL,
            content: {
              name: 'execute_code',
              title: '代码执行',
              input: executeCodeResult.input,
              output: executeCodeResult.output,
              icon: <Text2SqlIcon />,
            },
            consumeTime,
          });
        }
      } else if (skillName === 'text2sql') {
        // Text2SQL 工具
        const text2SqlResult = this.extractText2SqlResult(item.skill_info?.args, item.answer);
        if (text2SqlResult) {
          message.content.push({
            type: BlockType.TOOL,
            content: {
              name: 'text2sql',
              title: text2SqlResult.title || 'Text2SQL',
              input: text2SqlResult.sql,
              icon: <Text2SqlIcon />,
              output: {
                data: text2SqlResult.data,
              },
            },
            consumeTime,
          });
        }
      } else if (skillName === 'text2metric') {
        // Text2Metric 工具
        const text2MetricResult = this.extractText2MetricResult(item.skill_info?.args, item.answer);
        if (text2MetricResult) {
          message.content.push({
            type: BlockType.TOOL,
            content: {
              name: 'text2metric',
              title: text2MetricResult.title || 'Text2Metric',
              input: text2MetricResult.args,
              icon: <Text2MetricIcon />,
              output: {
                data: text2MetricResult.data,
              },
            },
            consumeTime,
          });
        }
      } else if (skillName === 'af_sailor') {
        // AfSailor 工具
        const afSailorResult = this.extractAfSailorResult(item.skill_info?.args, item.answer);
        if (afSailorResult) {
          message.content.push({
            type: BlockType.TOOL,
            content: {
              name: 'af_sailor',
              title: `找到${afSailorResult?.cites?.length || 0}条数据`,
              input: afSailorResult.text || [],
              icon: <AfSailorIcon />,
              output: {
                data: afSailorResult.cites,
              },
            },
            consumeTime,
          });
        }
      } else if (skillName === 'datasource_filter') {
        // DatasourceFilter 工具
        const datasourceFilterResult = this.extractDatasourceFilterResult(item.skill_info?.args, item.answer);
        if (datasourceFilterResult) {
          message.content.push({
            type: BlockType.TOOL,
            content: {
              name: 'datasource_filter',
              title: `匹配�?{datasourceFilterResult?.result?.length || 0}个数据`,
              input: [],
              icon: <AfSailorIcon />,
              output: {
                data: datasourceFilterResult.result,
              },
            },
            consumeTime,
          });
        }
      } else if (skillName === 'datasource_rerank') {
        // DatasourceRerank 工具，与 datasource_filter 处理方式一�?
        const datasourceRerankResult = this.extractDatasourceRerankResult(item.skill_info?.args, item.answer);
        if (datasourceRerankResult) {
          message.content.push({
            type: BlockType.TOOL,
            content: {
              name: 'datasource_rerank',
              title: `重排匹配�?{datasourceRerankResult?.result?.length || 0}个数据`,
              input: [],
              icon: <AfSailorIcon />,
              output: {
                data: datasourceRerankResult.result,
              },
            },
            consumeTime,
          });
        }
      } else {
        // 默认工具：统一�?DefaultToolResult 结构，使�?ToolBlock 渲染
        const defaultTool = this.buildDefaultToolResult(item.skill_info, item.answer);
        if (defaultTool) {
          message.content.push({
            type: BlockType.TOOL,
            content: {
              name: defaultTool.toolName,
              icon: <Text2SqlIcon />,
              title: defaultTool.result.title,
              input: defaultTool.result.input,
              output: defaultTool.result.output,
            },
            consumeTime,
          });
        }
      }
    } else if (item.stage === 'llm') {
      // LLM 回答
      if (item.answer) {
        message.content.push({
          type: BlockType.MARKDOWN,
          content: item.answer,
        });
      }
    }
  }

  /**
   * 构造默认工具结�?
   * 对应设计文档 4.32 DefaultToolResult 及默认工具处理逻辑
   */
  public buildDefaultToolResult(
    skillInfo: SkillInfo | undefined,
    answer: any,
  ): { toolName: string; result: DefaultToolResult } | null {
    if (!skillInfo?.name) {
      return null;
    }

    const toolName = skillInfo.name;
    const args = skillInfo.args || [];

    // �?args 转为 Record<string, any>
    const input: Record<string, any> = {};
    for (const arg of args) {
      if (arg?.name) {
        input[arg.name] = arg.value;
      }
    }

    const answerObj = answer || {};
    const output = answerObj?.result ?? answerObj?.full_result ?? answerObj;

    // 标题优先级：args 中的 input/query -> output.title -> answer.title -> 工具�?
    const titleArg = args.find(
      (arg) => arg?.name === 'input' || arg?.name === 'query',
    );
    let title =
      (titleArg?.value as string) ||
      (typeof output?.title === 'string' ? output.title : '') ||
      (typeof answerObj?.title === 'string' ? answerObj.title : '') ||
      toolName;

    const result: DefaultToolResult = {
      title,
      input,
      output,
    };

    return { toolName, result };
  }

  /**
   * 执行 upsert 操作
   * �?content 赋值到 JSONPath 指定的位�?
   */
  public applyUpsert(obj: AssistantMessage, key: Array<string | number>, content: any): AssistantMessage {
    if (key.length === 0) return obj;

    // 使用递归方式设置嵌套属�?
    const cloned = { ...obj };
    this.setNestedProperty(cloned, key, content);
    return cloned;
  }

  /**
   * 执行 append 操作
   * 如果 JSONPath 是数组下标，在该位置插入新对�?
   * 否则在文本后追加内容
   */
  public applyAppend(obj: AssistantMessage, key: Array<string | number>, content: any): AssistantMessage {
    if (key.length === 0) return obj;

    const cloned = { ...obj };
    const lastKey = key[key.length - 1];

    if (typeof lastKey === 'number') {
      // 数组追加：在指定索引位置插入
      const parentKey = key.slice(0, -1);
      const parent = this.getNestedProperty(cloned, parentKey) as any[];

      if (Array.isArray(parent)) {
        parent[lastKey] = content;
      }
    } else {
      // 文本追加：在现有内容后追�?
      const currentValue = this.getNestedProperty(cloned, key);

      if (typeof currentValue === 'string' && typeof content === 'string') {
        this.setNestedProperty(cloned, key, currentValue + content);
      } else {
        this.setNestedProperty(cloned, key, content);
      }
    }

    return cloned;
  }

  /**
   * 获取嵌套属�?
   */
  public getNestedProperty(obj: any, key: Array<string | number>): any {
    let current = obj;
    for (const k of key) {
      if (current == null) return undefined;
      current = current[k];
    }
    return current;
  }

  /**
   * 设置嵌套属�?
   */
  public setNestedProperty(obj: any, key: Array<string | number>, value: any): void {
    if (key.length === 0) return;

    let current = obj;
    for (let i = 0; i < key.length - 1; i++) {
      const k = key[i];
      const nextKey = key[i + 1];

      if (current[k] == null) {
        // 根据下一�?key 的类型决定创建对象还是数�?
        current[k] = typeof nextKey === 'number' ? [] : {};
      }
      current = current[k];
    }

    const lastKey = key[key.length - 1];
    current[lastKey] = value;
  }

  /**
   * 按路径不可变设置：只克隆从根�?key 路径上的节点，其余引用复用，避免全量深拷贝大对象
   */
  public immutableSetNested(obj: any, key: Array<string | number>, value: any): any {
    if (key.length === 0) return obj;
    const k = key[0];
    if (key.length === 1) {
      if (obj == null) return value;
      if (Array.isArray(obj)) {
        const arr = [...obj];
        arr[k as number] = value;
        return arr;
      }
      return { ...obj, [k]: value };
    }
    const rest = key.slice(1);
    const child = obj != null ? obj[k] : undefined;
    const newChild = this.immutableSetNested(child, rest, value);
    if (obj == null) {
      if (typeof k === 'number') {
        const arr: any[] = [];
        arr[k] = newChild;
        return arr;
      }
      return { [k]: newChild };
    }
    if (Array.isArray(obj)) {
      const arr = [...obj];
      arr[k as number] = newChild;
      return arr;
    }
    return { ...obj, [k]: newChild };
  }

  /**
   * 不可�?upsert：按路径更新，不深拷贝整棵树
   */
  public immutableApplyUpsert(obj: AssistantMessage, key: Array<string | number>, content: any): AssistantMessage {
    if (key.length === 0) return obj;
    return this.immutableSetNested(obj, key, content) as AssistantMessage;
  }

  /**
   * 不可�?append：按路径追加后按路径更新，不深拷贝整棵树
   */
  public immutableApplyAppend(obj: AssistantMessage, key: Array<string | number>, content: any): AssistantMessage {
    if (key.length === 0) return obj;
    const lastKey = key[key.length - 1];
    let newValue: any;
    if (typeof lastKey === 'number') {
      newValue = content;
    } else {
      const current = this.getNestedProperty(obj, key);
      newValue =
        typeof current === 'string' && typeof content === 'string' ? current + content : content;
    }
    return this.immutableSetNested(obj, key, newValue) as AssistantMessage;
  }

  /**
   * 检查是否需要刷�?token
   * AISHU DIP 平台返回 401 状态码时表�?token 失效
   * @param status HTTP 状态码
   * @param error 错误响应�?
   * @returns 返回是否需要刷�?token
   */
  public shouldRefreshToken(status: number, _error: any): boolean {
    // 401 Unauthorized 表示 token 失效
    return status === 401;
  }

    /**
     * 终止会话
     * 调用 DIP �?/app/{agent_key}/chat/termination 接口终止指定会话
     * 若返�?401 会先调用 refreshToken 获取�?token 并重试一�?
     * @param conversationId 要终止的会话 ID
     * @returns 返回 Promise，成功时 resolve，失败时 reject
     */
    public async terminateConversation(conversationId: string): Promise<void> {
      const url = `${this.dipBaseUrl}/app/${this.dipKey}/chat/termination`;

      await this.executeDataAgentWithTokenRefresh(async () => {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          Authorization: this.dipToken.startsWith('Bearer ') ? this.dipToken : `Bearer ${this.dipToken}`,
          'x-business-domain': this.dipBusinessDomain,
        };

        const body = JSON.stringify({
          conversation_id: conversationId,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error: any = new Error(`终止会话失败: ${response.status} ${errorText}`);
          error.status = response.status;
          error.body = errorText;
          throw error;
        }
      });
    }

    /**
     * 执行 API 调用，并在需要时自动刷新 token 并重试一�?
     * @param apiCall API 调用函数
     * @returns API 调用结果
     */
    public async executeDataAgentWithTokenRefresh<T>(
      apiCall: () => Promise<T>
    ): Promise<T> {
      try {
        // 第一次尝�?
        return await apiCall();
      } catch (error: any) {
        const status = error.status || error.response?.status || 0;
        const errorBody = error.body || error.response?.data || error;

        // 检查是否需要刷�?token
        const needsRefresh = this.shouldRefreshToken(status, errorBody);

        if (needsRefresh && this.dipRefreshToken) {
          try {
            // 调用 refreshToken 方法获取�?token
            const newToken = await this.dipRefreshToken();

            // 更新 token 属�?
            this.dipToken = newToken;

            // 重试 API 调用
            try {
              return await apiCall();
            } catch (retryError: any) {
              // 重试后仍然失败，检查是否还�?token 问题
              const retryStatus = retryError.status || retryError.response?.status || 0;
              const retryErrorBody = retryError.body || retryError.response?.data || retryError;

              if (this.shouldRefreshToken(retryStatus, retryErrorBody)) {
                // 重试后仍然提�?token 失效，放弃重�?
              }

              // 抛出重试后的错误
              throw retryError;
            }
          } catch (refreshError) {
            // 刷新失败，抛出原始错�?
            throw error;
          }
        }

        // 不需要刷�?token，直接抛出错�?
        throw error;
      }
    }

    /**
     * 获取历史会话列表
     * 调用 DIP �?GET /app/{agent_key}/conversation 接口获取会话列表
     * API 端点: GET /app/{agent_key}/conversation?page={page}&size={size}
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @param page 分页页码，默认为 1
     * @param size 每页返回条数，默认为 10
     * @returns 返回历史会话列表
     */
    public async getConversations(page: number = 1, size: number = 10): Promise<ConversationHistory[]> {
      try {
        // 构�?URL，包含分页参�?
        const url = `${this.dipBaseUrl}/app/${this.dipKey}/conversation?page=${page}&size=${size}`;

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.dipToken}`,
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`获取历史会话列表失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });

        // 从响应中提取会话列表
        const entries = result.data?.entries || result.entries || [];

        // �?API 响应转换�?ConversationHistory 格式
        const conversations: ConversationHistory[] = entries.map((item: any) => ({
          conversationID: item.id || '',
          title: item.title || 'δ�����Ự',
          created_at: item.create_time || 0,
          updated_at: item.update_time || 0,
          message_index: item.message_index,
          read_message_index: item.read_message_index,
        }));
        return conversations;
      } catch (error) {
        // 返回空数组，允许在失败的情况下继�?
        return [];
      }
    }

    /**
     * 获取指定会话 ID 的对话消息列�?
     * 调用 DIP �?GET /app/{agent_key}/conversation/{conversation_id} 接口获取会话详情
     * 如果对话消息�?AI 助手消息，则需要调�?reduceAssistantMessage() 解析消息
     * API 端点: GET /app/{agent_key}/conversation/{conversation_id}
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @param conversationId 会话 ID
     * @returns 返回对话消息列表
     */
    public async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
      try {
        // 构�?URL
        const url = `${this.dipBaseUrl}/app/${this.dipKey}/conversation/${conversationId}`;

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.dipToken}`,
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`获取会话消息列表失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });

        // 从响应中提取消息列表
        const messages = result.data?.Messages || result.Messages || [];

        // �?API 响应转换�?ChatMessage 格式
        const chatMessages: ChatMessage[] = [];

        for (const msg of messages) {
          const messageId = msg.id || `msg-${Date.now()}-${Math.random()}`;
          const origin = msg.origin || 'user';

          if (origin === 'user') {
            // 用户消息
            const userMessage: ChatMessage = {
              messageId,
              role: {
                name: '用户',
                type: RoleType.USER,
                avatar: '',
              },
              content: [],
            };

            // �?content 中提取文�?
            try {
              const contentObj = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
              const text = contentObj?.text || '';
              if (text) {
                userMessage.content.push({
                  type: BlockType.TEXT,
                  content: text,
                });
              }
            } catch (e) {
            }

            chatMessages.push(userMessage);
          } else if (origin === 'assistant') {
            // AI 助手消息
            // 根据文档第四�?解析历史对话消息"的流程处�?
            try {
              // 1. �?content 进行 JSON 反序列化
              const contentObj = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
              let ext: Record<string, unknown> | null = null;
              if (msg.ext != null) {
                if (typeof msg.ext === 'string') {
                  try {
                    ext = JSON.parse(msg.ext) as Record<string, unknown>;
                  } catch {
                    ext = null;
                  }
                } else if (typeof msg.ext === 'object') {
                  ext = msg.ext as Record<string, unknown>;
                }
              }

              const aiMessage: ChatMessage = {
                messageId,
                role: {
                  name: 'AI 助手',
                  type: RoleType.ASSISTANT,
                  avatar: '',
                },
                content: [],
              };

              // 2. 处理 middle_answer.progress 数组
              const middleAnswer = contentObj?.middle_answer;
              if (middleAnswer?.progress && Array.isArray(middleAnswer.progress)) {
                for (const progressItem of middleAnswer.progress) {
                  this.appendSkillOrLLMContentToMessage(progressItem, aiMessage);
                }
              }

              // 3. 从历史消息的 ext 中解�?messageContext：相关问题、耗时、tokens（与流式白名单一致）
              if (ext && typeof ext === 'object') {
                const relatedQuestions = Array.isArray(ext.related_queries)
                  ? (ext.related_queries as string[]).filter((q: string) => typeof q === 'string' && q.trim().length > 0)
                  : undefined;
                const elapsedSeconds =
                  typeof ext.total_time === 'number' && Number.isFinite(ext.total_time) ? ext.total_time : undefined;
                const totalTokens =
                  typeof ext.total_tokens === 'number' && Number.isFinite(ext.total_tokens)
                    ? ext.total_tokens
                    : ext.token_usage && typeof (ext.token_usage as any).total_tokens === 'number'
                      ? (ext.token_usage as any).total_tokens
                      : undefined;
                if (relatedQuestions?.length || elapsedSeconds != null || totalTokens != null) {
                  aiMessage.messageContext = {
                    ...(relatedQuestions?.length ? { relatedQuestions } : {}),
                    ...(elapsedSeconds != null ? { elapsedSeconds } : {}),
                    ...(totalTokens != null ? { totalTokens } : {}),
                  };
                }
              }

              chatMessages.push(aiMessage);
            } catch (e) {
            }
          }
        }
        return chatMessages;
      } catch (error) {
        // 返回空数组，允许在失败的情况下继�?
        return [];
      }
    }

    /**
     * 删除指定 ID 的会�?
     * 调用 DIP �?DELETE /app/{agent_key}/conversation/{conversation_id} 接口删除会话
     * API 端点: DELETE /app/{agent_key}/conversation/{conversation_id}
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @param conversationID 会话 ID
     * @returns 返回 Promise，成功时 resolve，失败时 reject
     */
    public async deleteConversation(conversationID: string): Promise<void> {
      try {
        // 构�?URL
        const url = `${this.dipBaseUrl}/app/${this.dipKey}/conversation/${conversationID}`;

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.dipToken}`,
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          // 204 No Content 表示删除成功
          if (!response.ok && response.status !== 204) {
            const errorText = await response.text();
            const error: any = new Error(`删除会话失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return response;
        });
      } catch (error) {
        throw error;
      }
    }

    /**
     * 获取知识网络详情
     * 调用 DIP �?GET /api/ontology-manager/v1/knowledge-networks/{id} 接口
     * API 端点: GET /api/ontology-manager/v1/knowledge-networks/{id}
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @param id 知识网络 ID
     * @returns 返回知识网络详情
     */
    public async getKnowledgeNetworksDetail(id: string): Promise<any> {
      try {
        // 构�?URL
        let url: string;
        if (this.dipBaseUrl.startsWith('http://') || this.dipBaseUrl.startsWith('https://')) {
          const baseUrlObj = new URL(this.dipBaseUrl);
          url = `${baseUrlObj.protocol}//${baseUrlObj.host}/api/ontology-manager/v1/knowledge-networks/${encodeURIComponent(id)}`;
        } else {
          url = `/api/ontology-manager/v1/knowledge-networks/${encodeURIComponent(id)}`;
        }

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.dipToken}`,
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`获取知识网络详情失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });
        return result.data || result;
      } catch (error) {
        throw error;
      }
    }

    /**
     * 获取知识网络的对象类�?
     * 调用 DIP �?GET /api/ontology-manager/v1/knowledge-networks/{id}/object-types 接口
     * API 端点: GET /api/ontology-manager/v1/knowledge-networks/{id}/object-types
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @param id 知识网络 ID
     * @param offset 偏移量，默认 0
     * @param limit 每页返回条数，默�?-1（全部）
     * @returns 返回对象类型列表
     */
    public async getKnowledgeNetworkObjectTypes(
      id: string,
      offset: number = 0,
      limit: number = -1
    ): Promise<any> {
      try {
        // 构�?URL
        // 构�?URL
        let baseUrl: string;
        if (this.dipBaseUrl.startsWith('http://') || this.dipBaseUrl.startsWith('https://')) {
          const baseUrlObj = new URL(this.dipBaseUrl);
          baseUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
        } else {
          baseUrl = '';
        }

        const url = `${baseUrl}/api/ontology-manager/v1/knowledge-networks/${encodeURIComponent(id)}/object-types?offset=${offset}&limit=${limit}`;

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.dipToken}`,
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`获取知识网络对象类型失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });
        return result.data || result;
      } catch (error) {
        throw error;
      }
    }

    /**
     * 根据指标 ID 获取指标信息
     * 调用 DIP �?GET /api/mdl-data-model/v1/metric-models/{ids} 接口
     * API 端点: GET /api/mdl-data-model/v1/metric-models/{ids}
     * 注意：该方法是一个无状态无副作用的函数，不允许修改 state
     * @param ids 指标 ID 列表，多个用逗号隔开
     * @returns 返回指标信息列表
     */
    public async getMetricInfoByIds(ids: string[]): Promise<any[]> {
      try {
        if (!ids || ids.length === 0) {
          return [];
        }

        // 构�?URL，多�?ID 用逗号隔开
        const idsParam = ids.join(',');
        let url: string;
        if (this.dipBaseUrl.startsWith('http://') || this.dipBaseUrl.startsWith('https://')) {
          const baseUrlObj = new URL(this.dipBaseUrl);
          url = `${baseUrlObj.protocol}//${baseUrlObj.host}/api/mdl-data-model/v1/metric-models/${encodeURIComponent(idsParam)}`;
        } else {
          url = `/api/mdl-data-model/v1/metric-models/${encodeURIComponent(idsParam)}`;
        }

        // 使用 executeDataAgentWithTokenRefresh 包装 API 调用，支�?token 刷新和重�?
        const result = await this.executeDataAgentWithTokenRefresh(async () => {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.dipToken}`,
              'x-business-domain': this.dipBusinessDomain,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`获取指标信息失败: ${response.status} - ${errorText}`);
            error.status = response.status;
            error.body = errorText;
            throw error;
          }

          return await response.json();
        });
        return Array.isArray(result) ? result : result.data || [];
      } catch (error) {
        throw error;
      }
    }
  }
}






