// lib/services/supabaseService.ts
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

// Initialize Supabase client - Replace with your actual Supabase URL and key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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

interface CreateUserResponse {
  success: boolean;
  user_id?: string;
  message?: string;
  error?: string;
}

export const useAuthRedirect = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error checking auth session:', error);
          redirectToLogin();
          return;
        }

        if (!session) {
          redirectToLogin();
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          redirectToLogin();
          return;
        }

        // Create or update user in database before proceeding
        const supabaseService = SupabaseService.getInstance();
        const userResult = await supabaseService.createOrUpdateUser(user);
        
        if (!userResult.success) {
          console.error('Failed to create/update user:', userResult.error);
          // Still proceed even if user creation fails, but log the error
        }

      } catch (error) {
        console.error('Authentication check failed:', error);
        redirectToLogin();
      }
    };

    const redirectToLogin = () => {
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    };

    checkAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          redirectToLogin();
        } else if (event === 'SIGNED_IN' && session?.user) {
          // Create or update user when they sign in
          const supabaseService = SupabaseService.getInstance();
          const userResult = await supabaseService.createOrUpdateUser(session.user);
          
          if (!userResult.success) {
            console.error('Failed to create/update user on sign in:', userResult.error);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [isMounted]);
};

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
   * Check if connected to database
   */
  isConnectedToDatabase(): boolean {
    return this.isConnected;
  }

  /**
   * Logout user from Supabase
   */
  async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Error signing out:', error);
        return {
          success: false,
          error: `Failed to sign out: ${error.message}`
        };
      }

      // Clear any local state
      this.currentChatId = null;
      this.isConnected = false;

      return {
        success: true
      };

    } catch (error) {
      console.error('Exception during logout:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Create or update user in database
   */
  async createOrUpdateUser(user: any): Promise<CreateUserResponse> {
    try {
      if (!user || !user.id) {
        return {
          success: false,
          error: 'User object is required'
        };
      }

      // Extract user information
      const userData = {
        user_id: user.id,
        email: user.email,
        google_id: user.user_metadata?.provider_id || user.id, // Use provider_id for Google, fallback to user.id
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || null,
        profile_picture: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        is_google_auth: user.app_metadata?.provider === 'google' || false
      };

      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('user_id')
        .eq('user_id', userData.user_id)
        .maybeSingle();

      if (checkError) {
        console.log('Error checking existing user:', checkError);
        return {
          success: false,
          error: `Failed to check existing user: ${checkError.message}`
        };
      }

      if (existingUser) {
        // Update existing user
        const { error: updateError } = await supabase
          .from('users')
          .update({
            email: userData.email,
            name: userData.name,
            profile_picture: userData.profile_picture,
            is_google_auth: userData.is_google_auth
          })
          .eq('user_id', userData.user_id);

        if (updateError) {
          console.log('Error updating user:', updateError);
          return {
            success: false,
            error: `Failed to update user: ${updateError.message}`
          };
        }

        return {
          success: true,
          user_id: userData.user_id,
          message: 'User updated successfully'
        };
      } else {
        // Create new user
        const { error: insertError } = await supabase
          .from('users')
          .insert(userData);

        if (insertError) {
          console.log('Error creating user:', insertError);
          return {
            success: false,
            error: `Failed to create user: ${insertError.message}`
          };
        }

        return {
          success: true,
          user_id: userData.user_id,
          message: 'User created successfully'
        };
      }

    } catch (error) {
      console.error('Exception creating/updating user:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get user from database
   */
  async getUser(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user:', error);
        return { success: false, error: error.message };
      }

      return { success: true, user: data };
      
    } catch (error) {
      console.error('Exception fetching user:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Create a new chat and first message
   */
  async createChatAndMessage(text: string, type: 'audio' | 'text' = 'audio'): Promise<CreateChatAndMessageResponse> {
    try {

      const now = new Date().toISOString();

      // Step 1: Insert chat record with the generated chat_id
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id || "user_id1",
        })
        .select('chat_id')
        .single();

      if (chatError) {
        console.error('SupabaseServiceError inserting chat:', chatError);
        throw new Error(`Failed to create chat: ${chatError.message}`);
      }

      this.currentChatId = chatData.chat_id;
      
      const { data: messageData, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          chat_id: this.currentChatId,
          role: 'USER',
          text: text.trim(),
          message_type: type
        })
        .select('message_id')
        .single();

      if (messageError) {
        console.error('SupabaseServiceError inserting message:', messageError);
        throw new Error(`Failed to create message: ${messageError.message}`);
      }

      return {
        success: true,
        chat_id: this.currentChatId!,
        message_id: messageData.message_id,
        message: 'Chat and message created successfully'
      };

    } catch (error) {
      console.error('SupabaseServiceError creating chat and message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Add a message to existing chat
   */
  async addMessageToChat(chatId: string, text: string, role: 'USER' | 'AI' = 'USER', type: 'audio' | 'text' = 'audio'): Promise<CreateMessageResponse> {
    try {
      if (!text || text.trim() === '') {
        throw new Error('Text content is required');
      }
      
      const { data: messageData, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          chat_id: chatId,
          role: role,
          text: text.trim(),
          message_type: type
        })
        .select('message_id')
        .single();

      if (messageError) {
        console.error('SupabaseServiceError inserting message:', messageError);
        throw new Error(`Failed to create message: ${messageError.message}`);
      }

      return {
        success: true,
        message_id: messageData.message_id,
        message: 'Message added successfully'
      };

    } catch (error) {
      console.error('SupabaseServiceError adding message:', error);
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
  async sendText(text: string, type: 'audio' | 'text' = 'audio'): Promise<CreateChatAndMessageResponse> {
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
        const result = await this.addMessageToChat(this.currentChatId, text, "USER", type);
        return {
          success: result.success,
          chat_id: this.currentChatId,
          message_id: result.message_id,
          message: result.message,
          error: result.error
        };
      } else {
        return await this.createChatAndMessage(text, type);
      }
    } catch (error) {
      console.error('SupabaseServiceError sending speech text:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
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
   * Get messages from a chat with error handling
   */
  async getChatMessages(chatId: string): Promise<GetMessagesResponse> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('SupabaseServiceError fetching messages:', error);
        return { success: false, error: error.message };
      }

      return { success: true, messages: data || [] };
      
    } catch (error) {
      console.error('SupabaseServiceException fetching messages:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Get messages from a chat with chat id
   */
  async listenToChatMessagesAfter(chatId: string, message_id: string): Promise<GetMessagesResponse> {
    try {
      // Get the timestamp of the reference message
      console.log(message_id);
      const { data: refMessage, error: refError } = await supabase
        .from('chat_messages')
        .select('created_at')
        .eq('message_id', message_id)
        .eq('chat_id', chatId)
        .maybeSingle();

      if (refError) {
        console.error('SupabaseServiceError fetching reference message:', refError);
        return { success: false, error: refError.message };
      }

      if(!refMessage){
        console.log("No messsages found with the message id")
        return {
          "success": false,
          "error": "No message found with the message id",
          "messages": []
        };
      }

      const referenceTimestamp = refMessage.created_at;

      // First, get any existing messages after the reference message
      const { data: existingMessages, error: existingError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .gt('created_at', referenceTimestamp)
        .order('created_at', { ascending: true });

      if (existingError) {
        console.error('SupabaseServiceError fetching existing messages:', existingError);
        return { success: false, error: existingError.message };
      }

      // If there are already messages, return them immediately
      if (existingMessages && existingMessages.length > 0) {
        return { success: true, messages: existingMessages };
      }

      // Set up real-time subscription to listen for new messages
      return new Promise((resolve) => {
        const subscription = supabase
          .channel(`chat_messages_${chatId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'chat_messages',
              filter: `chat_id=eq.${chatId}`
            },
            (payload) => {
              const newMessage = payload.new as any;
              
              // Check if the new message is after our reference timestamp
              if (newMessage.created_at > referenceTimestamp) {
                // Unsubscribe and return the new message
                subscription.unsubscribe();
                resolve({ success: true, messages: [newMessage] });
              }
            }
          )
          .subscribe();

        // Optional: Add a timeout to prevent infinite waiting
        setTimeout(() => {
          subscription.unsubscribe();
          resolve({ success: false, error: 'Timeout waiting for new messages' });
        }, 60000); // 60 second timeout
      });

    } catch (error) {
      console.error('SupabaseServiceException fetching messages:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Wait for AI response with fallback options
   */
  async waitForAIResponse(chatId: string, userMessageId: string, timeoutMs: number = 30000): Promise<GetMessagesResponse> {
    try {
      // Get the timestamp of the user message
      const { data: refMessage, error: refError } = await supabase
        .from('chat_messages')
        .select('created_at')
        .eq('message_id', userMessageId)
        .eq('chat_id', chatId)
        .maybeSingle();

      if (refError || !refMessage) {
        return { success: false, error: 'Reference message not found' };
      }

      console.log("message found" + refMessage.created_at);

      const referenceTimestamp = refMessage.created_at;

      // Check for existing AI messages after user message
      const { data: existingMessages, error: existingError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .eq('role', 'AI')
        .gt('created_at', referenceTimestamp)
        .order('created_at', { ascending: true })
        .limit(1);

      if (existingError) {
        return { success: false, error: existingError.message };
      }

      if (existingMessages && existingMessages.length > 0) {
        return { success: true, messages: existingMessages };
      }

      // Set up real-time subscription with shorter timeout
      return new Promise((resolve) => {
        const subscription = supabase
          .channel(`ai_response_${chatId}_${userMessageId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'chat_messages',
              filter: `chat_id=eq.${chatId}`
            },
            (payload) => {
              const newMessage = payload.new as any;
              
              if (newMessage.role === 'AI' && newMessage.created_at > referenceTimestamp) {
                subscription.unsubscribe();
                resolve({ success: true, messages: [newMessage] });
              }
            }
          )
          .subscribe();

        // Shorter timeout
        setTimeout(() => {
          subscription.unsubscribe();
          resolve({ 
            success: false, 
            error: 'Timeout waiting for AI response',
            messages: []
          });
        }, timeoutMs);
      });

    } catch (error) {
      console.error('Error waiting for AI response:', error);
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
        console.error('SupabaseServiceError fetching chat metadata:', error);
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
        .from('chats')
        .delete()
        .eq('chat_id', chatId);

      if (messagesError) {
        console.error('SupabaseServiceError deleting messages:', messagesError);
        throw new Error(`Failed to delete messages: ${messagesError.message}`);
      }

      // Then delete the chat
      const { error: chatError } = await supabase
        .from('chats')
        .delete()
        .eq('chat_id', chatId);

      if (chatError) {
        console.error('SupabaseServiceError deleting chat:', chatError);
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
        console.error('SupabaseServiceError fetching user chats:', error);
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
