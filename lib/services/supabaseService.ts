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

interface ConnectionTestResponse {
  success: boolean;
  connected: boolean;
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
  async testConnection(): Promise<ConnectionTestResponse> {
    try {
      console.log('🔍 Testing Supabase connection...');
      
      // Test with a simple query to check if tables exist
      const { data, error } = await supabase
        .from('chats')
        .select('chat_id')
        .limit(1);

      if (error) {
        console.error('❌ Connection test failed:', error);
        console.error('❌ Error details:', error.code, error.message, error.details);
        this.isConnected = false;
        return {
          success: false,
          connected: false,
          error: `Connection test failed: ${error.message}`
        };
      }

      console.log('✅ Supabase connection successful');
      console.log('✅ Connection test data:', data);
      this.isConnected = true;
      return {
        success: true,
        connected: true
      };

    } catch (error) {
      console.error('❌ Connection test exception:', error);
      this.isConnected = false;
      return {
        success: false,
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown connection error'
      };
    }
  }

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
      console.log('💾 Creating new chat and message...');
      
      // Skip connection test messages
      if (text.trim() === 'connection_test') {
        console.log('⚠️ Skipping connection test message');
        return {
          success: true,
          message: 'Connection test skipped'
        };
      }

      // Hardcoded values as requested
      const user_id = 'user_id1';
      const ip = 'https://7dd2fe00da2e.ngrok-free.app'; // Empty for now as requested
      
      // Validate required fields
      if (!text || text.trim() === '') {
        throw new Error('Text content is required');
      }

      const now = new Date().toISOString();

      // Generate UUID before insert
      const chatId = crypto.randomUUID();

      // Step 1: Insert chat record with the generated chat_id
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({
          chat_id: chatId,  // Explicitly set the chat_id
          user_id: user_id,
          ip: ip, 
          context: '', // Initialize with empty context
          created_at: now,
          updated_at: now
        })
        .select('chat_id')
        .single();

      if (chatError) {
        console.error('❌ Error inserting chat:', chatError);
        throw new Error(`Failed to create chat: ${chatError.message}`);
      }

      this.currentChatId = chatId; // Store for future messages

      console.log('✅ Chat created with ID:', chatId);

      // Step 2: Insert message using the chat_id
      // Generate UUID for message_id
      const messageId = crypto.randomUUID();
      
      // FIXED: Using correct enum value 'USER' instead of 'USER-DEFINED'
      const { data: messageData, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          message_id: messageId, // Explicitly set the message_id
          chat_id: chatId,
          role: 'USER', // Changed from 'USER-DEFINED' to 'USER' to match enum
          text: text.trim(),
          created_at: now
        })
        .select('message_id')
        .single();

      if (messageError) {
        console.error('❌ Error inserting message:', messageError);
        throw new Error(`Failed to create message: ${messageError.message}`);
      }

      console.log('✅ Message created with ID:', messageData.message_id);

      return {
        success: true,
        chat_id: chatId,
        message_id: messageData.message_id,
        message: 'Chat and message created successfully'
      };

    } catch (error) {
      console.error('❌ Error creating chat and message:', error);
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
      console.log('💾 Adding message to existing chat:', chatId);
      
      // Skip connection test messages
      if (text.trim() === 'connection_test') {
        console.log('⚠️ Skipping connection test message');
        return {
          success: true,
          message: 'Connection test skipped'
        };
      }

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
        console.error('❌ Error inserting message:', messageError);
        throw new Error(`Failed to create message: ${messageError.message}`);
      }

      console.log('✅ Message added with ID:', messageData.message_id);

      return {
        success: true,
        message_id: messageData.message_id,
        message: 'Message added successfully'
      };

    } catch (error) {
      console.error('❌ Error adding message:', error);
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
      console.log('🎤 Processing speech text:', text);
      console.log('🎤 Text length:', text.length);
      console.log('🎤 Current chat ID:', this.currentChatId);
      console.log('🎤 Connection status:', this.isConnected);
      
      // Handle connection test specifically
      if (text.trim() === 'connection_test') {
        console.log('🔍 Connection test requested');
        const connectionResult = await this.testConnection();
        
        if (connectionResult.success) {
          return {
            success: true,
            message: 'Connection test successful'
          };
        } else {
          return {
            success: false,
            error: connectionResult.error || 'Connection test failed'
          };
        }
      }

      // First test connection if not already connected
      if (!this.isConnected) {
        console.log('🔍 Testing connection before saving...');
        const connectionResult = await this.testConnection();
        if (!connectionResult.success) {
          return {
            success: false,
            error: `Database not connected: ${connectionResult.error}`
          };
        }
      }

      // Validate text content
      if (!text || text.trim() === '') {
        console.log('⚠️ Empty text provided, skipping save');
        return {
          success: false,
          error: 'Text content is required'
        };
      }

      // If we have an active chat, add to it; otherwise create new chat
      if (this.currentChatId) {
        console.log('📝 Adding to existing chat:', this.currentChatId);
        const result = await this.addMessageToChat(this.currentChatId, text);
        return {
          success: result.success,
          chat_id: this.currentChatId,
          message_id: result.message_id,
          message: result.message,
          error: result.error
        };
      } else {
        console.log('🆕 Creating new chat and message');
        return await this.createChatAndMessage(text);
      }
    } catch (error) {
      console.error('❌ Error sending speech text:', error);
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
    console.log('🔄 Current chat ID set to:', chatId);
  }

  /**
   * Start new conversation (reset current chat)
   */
  startNewConversation(): void {
    const previousChatId = this.currentChatId;
    this.currentChatId = null;
    console.log('🆕 New conversation started (previous chat:', previousChatId, ')');
  }

  /**
   * Get messages from a chat with better error handling
   */
  async getChatMessages(chatId: string): Promise<GetMessagesResponse> {
    try {
      console.log('📖 Fetching messages for chat:', chatId);
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching messages:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Fetched', data?.length || 0, 'messages');
      return { success: true, messages: data || [] };
      
    } catch (error) {
      console.error('❌ Exception fetching messages:', error);
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
      console.log('📝 Updating chat context for:', chatId);
      
      const { error } = await supabase
        .from('chats')
        .update({ 
          context: context,
          updated_at: new Date().toISOString()
        })
        .eq('chat_id', chatId);

      if (error) {
        console.error('❌ Error updating chat context:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Chat context updated successfully');
      return { success: true, message: 'Chat context updated successfully' };
      
    } catch (error) {
      console.error('❌ Exception updating chat context:', error);
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
      console.log('📊 Fetching chat metadata for:', chatId);
      
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('chat_id', chatId)
        .single();

      if (error) {
        console.error('❌ Error fetching chat metadata:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Chat metadata fetched successfully');
      return { success: true, data };
      
    } catch (error) {
      console.error('❌ Exception fetching chat metadata:', error);
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
      console.log('🗑️ Deleting chat:', chatId);
      
      // First delete all messages in the chat
      const { error: messagesError } = await supabase
        .from('chat_messages')
        .delete()
        .eq('chat_id', chatId);

      if (messagesError) {
        console.error('❌ Error deleting messages:', messagesError);
        throw new Error(`Failed to delete messages: ${messagesError.message}`);
      }

      // Then delete the chat
      const { error: chatError } = await supabase
        .from('chats')
        .delete()
        .eq('chat_id', chatId);

      if (chatError) {
        console.error('❌ Error deleting chat:', chatError);
        throw new Error(`Failed to delete chat: ${chatError.message}`);
      }

      // If this was the current chat, reset it
      if (this.currentChatId === chatId) {
        this.currentChatId = null;
      }

      console.log('✅ Chat deleted successfully');
      return { success: true, message: 'Chat deleted successfully' };
      
    } catch (error) {
      console.error('❌ Exception deleting chat:', error);
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
      
      console.log('📋 Fetching user chats for:', user_id);
      
      const { data, error } = await supabase
        .from('chats')
        .select('chat_id, created_at, updated_at, context')
        .eq('user_id', user_id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching user chats:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Fetched', data?.length || 0, 'chats');
      return { success: true, chats: data || [] };
      
    } catch (error) {
      console.error('❌ Exception fetching user chats:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }
}

export default SupabaseService;