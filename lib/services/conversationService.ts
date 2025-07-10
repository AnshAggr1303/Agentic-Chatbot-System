// lib/services/conversationService.ts
export class ConversationService {
  private currentChatId: string | null = null;
  private currentMessageId: string | null = null;
  private callbacks: {
    onChatIdChange?: (chatId: string) => void;
    onMessageIdChange?: (messageId: string) => void;
    onError?: (error: string) => void;
  } = {};

  constructor() {}

  setCallbacks(callbacks: typeof this.callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  generateChatId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startNewConversation(): string {
    const newChatId = this.generateChatId();
    this.currentChatId = newChatId;
    this.currentMessageId = null;
    this.callbacks.onChatIdChange?.(newChatId);
    return newChatId;
  }

  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  getCurrentMessageId(): string | null {
    return this.currentMessageId;
  }

  createNewMessage(): string {
    const messageId = this.generateMessageId();
    this.currentMessageId = messageId;
    this.callbacks.onMessageIdChange?.(messageId);
    return messageId;
  }

  ensureChatId(): string {
    if (!this.currentChatId) {
      return this.startNewConversation();
    }
    return this.currentChatId;
  }
}
