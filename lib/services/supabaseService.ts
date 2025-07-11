// lib/services/supabaseService.ts
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client - Replace with your actual Supabase URL and key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qlphizfsggoinjxmxjep.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFscGhpemZzZ2dvaW5qeG14amVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4Njc5MTQsImV4cCI6MjA2NzQ0MzkxNH0.IcXKb6ug3hIuBJBziC47eC6meeZyi2do2yMyFy9Z4bY'
);

interface CreateChatAndMessageResponse {
  success: boolean;
  chat_id?: string;
  message_id?: string;
  message?: string;
  error?: string;
}

interface CreateMessageResponse {
  success: boolean;
  message_id?: string;
  message?: string;
  error?: string;
}

interface GetMessagesResponse {
  success: boolean;
  messages?: any[];
  error?: string;
}

interface UpdateContextResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class SupabaseService {
  private static instance: SupabaseService;
  private currentChatId: string | null = null;
  private isConnected: boolean = false;

  private constructor() {}

  static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  /**
   * Test database connection
   */

  /**
   * Check if connected to database
   */
  isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  /**
   * Create a new chat and first message
   */
  async createChatAndMessage(text: string): Promise<CreateChatAndMessageResponse> {
    try {

      // hardcoded values
      const user_id = 'user_id1';
      const ip = 'https://7dd2fe00da2e.ngrok-free.app';

      const now = new Date().toISOString();

      // Step 1: Insert chat record with the generated chat_id
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({
          user_id: user_id,
          ip: ip, 
          context: ''
        })
        .select('chat_id')
        .single();

      if (chatError) {
        console.error('VoiceActivityDetectorError inserting chat:', chatError);
        throw new Error(`Failed to create chat: ${chatError.message}`);
      }

      this.currentChatId = chatData.chat_id;
      
      const { data: messageData, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          chat_id: this.currentChatId,
          role: 'USER',
          text: text.trim()
        })
        .select('message_id')
        .single();

      if (messageError) {
        console.error('VoiceActivityDetectorError inserting message:', messageError);
        throw new Error(`Failed to create message: ${messageError.message}`);
      }

      return {
        success: true,
        chat_id: this.currentChatId!,
        message_id: messageData.message_id,
        message: 'Chat and message created successfully'
      };

    } catch (error) {
      console.error('VoiceActivityDetectorError creating chat and message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Add a message to existing chat
   */
  async addMessageToChat(chatId: string, text: string, role: 'USER' | 'AI' = 'USER'): Promise<CreateMessageResponse> {
    try {
      if (!text || text.trim() === '') {
        throw new Error('Text content is required');
      }

      // FIXED: Using correct enum values 'USER' and 'AI' instead of 'USER' and 'ASSISTANT'
      // Generate UUID for message_id
      const messageId = crypto.randomUUID();
      
      const { data: messageData, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          message_id: messageId, // Explicitly set the message_id
          chat_id: chatId,
          role: role, // Now using correct enum values: 'USER' or 'AI'
          text: text.trim(),
          created_at: new Date().toISOString()
        })
        .select('message_id')
        .single();

      if (messageError) {
        console.error('VoiceActivityDetectorError inserting message:', messageError);
        throw new Error(`Failed to create message: ${messageError.message}`);
      }

      return {
        success: true,
        message_id: messageData.message_id,
        message: 'Message added successfully'
      };

    } catch (error) {
      console.error('VoiceActivityDetectorError adding message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Send speech text to database (main function for STT integration)
   * This is the primary method called by useSpeech hook
   */
  async sendSpeechText(text: string): Promise<CreateChatAndMessageResponse> {
    try {
      // Validate text content
      if (!text || text.trim() === '') {
        return {
          success: false,
          error: 'Text content is required'
        };
      }

      // If we have an active chat, add to it; otherwise create new chat
      if (this.currentChatId) {
        const result = await this.addMessageToChat(this.currentChatId, text);
        return {
          success: result.success,
          chat_id: this.currentChatId,
          message_id: result.message_id,
          message: result.message,
          error: result.error
        };
      } else {
        return await this.createChatAndMessage(text);
      }
    } catch (error) {
      console.error('VoiceActivityDetectorError sending speech text:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Add AI response to chat
   */
  async addAIResponse(chatId: string, response: string): Promise<CreateMessageResponse> {
    return await this.addMessageToChat(chatId, response, 'AI'); // Changed from 'ASSISTANT' to 'AI'
  }

  /**
   * Get current chat ID
   */
  getCurrentChatId(): string | null {
    return this.currentChatId;
  }

  /**
   * Set current chat ID (useful for continuing existing conversations)
   */
  setCurrentChatId(chatId: string): void {
    this.currentChatId = chatId;
  }

  /**
   * Start new conversation (reset current chat)
   */
  startNewConversation(): void {
    this.currentChatId = null;
  }

  /**
   * Get messages from a chat with better error handling
   */
  async getChatMessages(chatId: string): Promise<GetMessagesResponse> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('VoiceActivityDetectorError fetching messages:', error);
        return { success: false, error: error.message };
      }

      return { success: true, messages: data || [] };
      
    } catch (error) {
      console.error('VoiceActivityDetectorException fetching messages:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Update chat context with better error handling
   */
  async updateChatContext(chatId: string, context: string): Promise<UpdateContextResponse> {
    try {
      const { error } = await supabase
        .from('chats')
        .update({ 
          context: context,
          updated_at: new Date().toISOString()
        })
        .eq('chat_id', chatId);

      if (error) {
        console.error('VoiceActivityDetectorError updating chat context:', error);
        return { success: false, error: error.message };
      }

      return { success: true, message: 'Chat context updated successfully' };
      
    } catch (error) {
      console.error('VoiceActivityDetectorException updating chat context:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Get chat metadata
   */
  async getChatMetadata(chatId: string) {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('chat_id', chatId)
        .single();

      if (error) {
        console.error('VoiceActivityDetectorError fetching chat metadata:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
      
    } catch (error) {
      console.error('VoiceActivityDetectorException fetching chat metadata:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Delete a chat and all its messages
   */
  async deleteChat(chatId: string) {
    try {
      // First delete all messages in the chat
      const { error: messagesError } = await supabase
        .from('chat_messages')
        .delete()
        .eq('chat_id', chatId);

      if (messagesError) {
        console.error('VoiceActivityDetectorError deleting messages:', messagesError);
        throw new Error(`Failed to delete messages: ${messagesError.message}`);
      }

      // Then delete the chat
      const { error: chatError } = await supabase
        .from('chats')
        .delete()
        .eq('chat_id', chatId);

      if (chatError) {
        console.error('VoiceActivityDetectorError deleting chat:', chatError);
        throw new Error(`Failed to delete chat: ${chatError.message}`);
      }

      // If this was the current chat, reset it
      if (this.currentChatId === chatId) {
        this.currentChatId = null;
      }

      return { success: true, message: 'Chat deleted successfully' };
      
    } catch (error) {
      console.error('VoiceActivityDetectorException deleting chat:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Get all chats for a user (using the hardcoded user_id)
   */
  async getUserChats() {
    try {
      const user_id = 'user_id1'; // Same hardcoded value
      
      const { data, error } = await supabase
        .from('chats')
        .select('chat_id, created_at, updated_at, context')
        .eq('user_id', user_id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('VoiceActivityDetectorError fetching user chats:', error);
        return { success: false, error: error.message };
      }

      return { success: true, chats: data || [] };
      
    } catch (error) {
      console.error('VoiceActivityDetectorException fetching user chats:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }
}

export default SupabaseService;