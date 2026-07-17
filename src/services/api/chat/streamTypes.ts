import type {
  Attachment,
  ChatConfig,
  ImageSource,
  Message,
  MessageOutputBlock,
  ModelMetadata,
  ModelProvider,
  Source,
  ToolCall,
} from "@/types";
import type { ChatToolDefinition } from "./types";

export type SearchStatusResults = {
  sources: Source[];
  images: ImageSource[];
};

export type ChatUsagePayload = {
  usage?: unknown;
  usageMetadata?: unknown;
};

export interface ToolConfirmationRequest {
  toolCall: ToolCall;
  pluginId: string;
  pluginTitle: string;
  risk: NonNullable<ToolCall["risk"]>;
  isMcp: boolean;
}

export type StreamChatResponseArgs = [
  sessionId: string,
  model: string,
  history: Message[],
  newMessage: string,
  attachments: Attachment[],
  config: Partial<ChatConfig>,
  onChunk: (
    text: string,
    reasoning?: string,
    outputBlocks?: MessageOutputBlock[],
  ) => void,
  userSystemInstruction?: string,
  onSearchStatus?: (
    isSearching: boolean,
    results?: SearchStatusResults,
  ) => void,
  onToolUpdate?: (toolCalls: ToolCall[]) => void,
  onImage?: (images: Attachment[]) => void,
  onUsage?: (usage: ChatUsagePayload) => void,
  signal?: AbortSignal,
  activePlugins?: string[],
  skillsContext?: string,
  onOutputBlocks?: (outputBlocks: MessageOutputBlock[]) => void,
  requestToolConfirmation?: (
    request: ToolConfirmationRequest,
  ) => Promise<boolean>,
];

export interface StreamChatOptions {
  sessionId: string;
  model: string;
  history: Message[];
  newMessage: string;
  attachments: Attachment[];
  config: Partial<ChatConfig>;
  onChunk: StreamChatResponseArgs[6];
  userSystemInstruction?: string;
  onSearchStatus?: StreamChatResponseArgs[8];
  onToolUpdate?: StreamChatResponseArgs[9];
  onImage?: StreamChatResponseArgs[10];
  onUsage?: StreamChatResponseArgs[11];
  signal?: AbortSignal;
  activePlugins?: string[];
  skillsContext?: string;
  onOutputBlocks?: StreamChatResponseArgs[15];
  requestToolConfirmation?: StreamChatResponseArgs[16];
}

export interface PreparedChatRequest {
  options: StreamChatOptions;
  provider: ModelProvider;
  providers: ModelProvider[];
  modelName: string;
  selectedModelMetadata?: ModelMetadata;
  directImageGeneration: boolean;
  tools: ChatToolDefinition[];
  requestHistory: Message[];
  requestMessage: string;
  requestAttachments: Attachment[];
  requestConfig: Partial<ChatConfig>;
}

export interface ChatRoundResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  usage?: ChatUsagePayload;
}
