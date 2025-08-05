// index.js - Updated for structured learning data
// require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3002;

// Supabase configuration
const supabaseUrl = "https://qlphizfsggoinjxmxjep.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFscGhpemZzZ2dvaW5qeG14amVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4Njc5MTQsImV4cCI6MjA2NzQ0MzkxNH0.IcXKb6ug3hIuBJBziC47eC6meeZyi2do2yMyFy9Z4bY";

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables: SUPABASE_URL and/or SUPABASE_ANON_KEY');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Function to fetch chat context and update it
async function fetchChatContext(chatId, messageText, chatResponse) {
  try {
    // Fetch chat data
    const { data: chatDataResult, error: chatError } = await supabase
      .from('chats')
      .select('context')
      .eq('chat_id', chatId)
      .single();
    
    if (chatError) {
      console.error(`Failed to fetch chat data for chatId ${chatId}:`, chatError);
      throw new Error(`Failed to fetch chat data: ${chatError.message}`);
    }
    
    if (!chatDataResult) {
      console.error(`Chat not found for chatId: ${chatId}`);
      throw new Error('Chat not found');
    }

    // Fetch all chat messages for this chat, ordered by creation time
    const { data: messagesData, error: messagesError } = await supabase
      .from('chat_messages')
      .select('role, text, message_type, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error(`Failed to fetch chat messages for chatId ${chatId}:`, messagesError);
      throw new Error(`Failed to fetch chat messages: ${messagesError.message}`);
    }

    // Build conversation history from messages
    let conversationHistory = '';
    if (messagesData && messagesData.length > 0) {
      conversationHistory = messagesData
        .map(msg => `${msg.role}: ${msg.text || '[Audio message]'}`)
        .join('\n');
    }

    // Combine existing context with conversation history and new message
    const fullContext = [
      chatDataResult.context || '',
      conversationHistory,
      `User: ${messageText}`
    ].filter(part => part.trim()).join('\n');
    
    // Update the chat context with the new message
    const updatedContext = `${chatDataResult.context || ''}\nUser: ${messageText}\nAssistant: Response generated`;
    
    const { error: updateError } = await supabase
      .from('chats')
      .update({
        context: updatedContext,
        updated_at: new Date().toISOString()
      })
      .eq('chat_id', chatId);
    
    if (updateError) {
      console.error(`Failed to update chat context for chatId ${chatId}:`, updateError);
    }
    
    return {
      ...chatDataResult,
      context: fullContext, // Return the enhanced context with all messages
      messageHistory: messagesData
    };
    
  } catch (error) {
    console.error(`Error in fetchAndUpdateChatContext for chatId ${chatId}:`, error);
    throw error;
  }
}

async function callPythonFunction(question, context, fileName, messageType = 'audio', voice = 'Kore') {
  return new Promise((resolve, reject) => {
    // Build the command arguments based on the new func.py interface
    const args = ['func.py', question, context, messageType];
    
    // Add additional arguments for audio type
    if (messageType === 'audio') {
      args.push(`file_name=${fileName}`);
      args.push(`voice=${voice}`);
    }
    
    const pythonProcess = spawn('python3', args);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`Python script completed successfully for file: ${fileName}`);
        
        // Parse the output to extract the printed values
        const result = {};
        const lines = stdout.split('\n');
        
        lines.forEach(line => {
          if (line.includes('message_type:')) {
            result.message_type = line.split('message_type:')[1].trim();
          } else if (line.includes('response_text:')) {
            result.response_text = line.split('response_text:')[1].trim();
          } else if (line.includes('audio_file:')) {
            result.audio_file = line.split('audio_file:')[1].trim();
          } else if (line.includes('updated_context:')) {
            result.updated_context = line.split('updated_context:')[1].trim();
          } else if (line.includes('audio_tokens:')) {
            result.audio_tokens = parseInt(line.split('audio_tokens:')[1].trim()) || 0;
          } else if (line.includes('text_tokens:')) {
            result.text_tokens = parseInt(line.split('text_tokens:')[1].trim()) || 0;
          } else if (line.includes('total_tokens:')) {
            result.total_tokens = parseInt(line.split('total_tokens:')[1].trim()) || 0;
          } else if (line.includes('processing_time_ms:')) {
            result.processing_time_ms = parseFloat(line.split('processing_time_ms:')[1].trim()) || 0;
          } else if (line.includes('voice_used:')) {
            result.voice_used = line.split('voice_used:')[1].trim();
          } else if (line.includes('model_used:')) {
            result.model_used = line.split('model_used:')[1].trim();
          } else if (line.includes('timestamp:')) {
            result.timestamp = line.split('timestamp:')[1].trim();
          } else if (line.includes('generation_success:')) {
            result.generation_success = line.split('generation_success:')[1].trim() === 'True';
          } else if (line.includes('mastery_level:')) {
            result.mastery_level = line.split('mastery_level:')[1].trim();
          } else if (line.includes('has_follow_up:')) {
            result.has_follow_up = line.split('has_follow_up:')[1].trim() === 'True';
          } else if (line.includes('follow_up_question:')) {
            result.follow_up_question = line.split('follow_up_question:')[1].trim();
          } else if (line.includes('duration_seconds:')) {
            result.duration_seconds = parseFloat(line.split('duration_seconds:')[1].trim()) || 0;
          } else if (line.includes('error:')) {
            const error = line.split('error:')[1].trim();
            reject(new Error(error));
            return;
          }
        });
        
        // For backward compatibility, set generated_text to response_text
        result.generated_text = result.response_text;
        
        resolve(result);
      } else {
        console.error(`Python script failed with code ${code} for file ${fileName}:`, stderr);
        reject(new Error(`Python script failed with code ${code}: ${stderr}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      console.error(`Python process error for file ${fileName}:`, error);
      reject(error);
    });
  });
}

// Helper function to safely build chat message data with only existing columns
function buildChatMessageData(chatId, pythonResult, messageType, audioUrl = null) {
  const baseData = {
    chat_id: chatId,
    role: 'AI',
    text: pythonResult.response_text || '',
    message_type: messageType
  };
  
  // Add audio URL if provided
  if (audioUrl) {
    baseData.audio_url = audioUrl;
  }
  
  // Add structured learning data if available (only if columns exist)
  const structuredFields = {
    mastery_level: pythonResult.mastery_level,
    has_follow_up: pythonResult.has_follow_up,
    follow_up_question: pythonResult.follow_up_question,
    generation_success: pythonResult.generation_success,
    processing_time_ms: pythonResult.processing_time_ms,
    model_used: pythonResult.model_used,
    total_tokens: pythonResult.total_tokens,
    text_tokens: pythonResult.text_tokens
  };
  
  // Add audio-specific fields
  if (messageType === 'audio') {
    structuredFields.voice_used = pythonResult.voice_used;
    structuredFields.audio_tokens = pythonResult.audio_tokens;
  }
  
  // Only add fields that have values
  Object.keys(structuredFields).forEach(key => {
    if (structuredFields[key] !== undefined && structuredFields[key] !== null && structuredFields[key] !== '') {
      baseData[key] = structuredFields[key];
    }
  });
  
  return baseData;
}

async function uploadToSupabase(audioFilePath, chatId, pythonResult, messageType = 'audio') {
  try {
    const fileBuffer = fs.readFileSync(audioFilePath);
    const fileName = path.basename(audioFilePath);
    const storagePath = `responses/${chatId}/${fileName}`;
    
    let contentType = 'application/octet-stream';
    const fileExtension = path.extname(fileName).toLowerCase();
    
    switch (fileExtension) {
      case '.wav':
        contentType = 'audio/wav';
        break;
      case '.mp3':
        contentType = 'audio/mpeg';
        break;
      case '.ogg':
        contentType = 'audio/ogg';
        break;
      case '.m4a':
        contentType = 'audio/mp4';
        break;
      case '.flac':
        contentType = 'audio/flac';
        break;
      default:
        contentType = 'audio/wav';
    }
    
    const { data, error } = await supabase.storage
      .from('responses')
      .upload(storagePath, fileBuffer, {
        contentType: contentType,
        upsert: true,
        cacheControl: '3600'
      });
    
    if (error) {
      console.error(`Failed to upload file to Supabase storage for chatId ${chatId}:`, error);
      throw error;
    }
    
    const { data: publicUrlData } = supabase.storage
      .from('responses')
      .getPublicUrl(storagePath);
    
    // Build chat message data using helper function
    const chatMessageData = buildChatMessageData(chatId, pythonResult, messageType, publicUrlData.publicUrl);
    
    // Insert with error handling for missing columns
    const { data: insertedData, error: chatMessageError } = await supabase
      .from('chat_messages')
      .insert([chatMessageData])
      .select();
    
    if (chatMessageError) {
      console.error(`Failed to insert chat message for chatId ${chatId}:`, chatMessageError);
      
      // If it's a column not found error, try with minimal data
      if (chatMessageError.code === 'PGRST204') {
        console.log('Attempting insert with minimal data due to missing columns...');
        const minimalData = {
          chat_id: chatId,
          role: 'AI',
          text: pythonResult.response_text || '',
          message_type: messageType,
          audio_url: publicUrlData.publicUrl
        };
        
        const { data: retryData, error: retryError } = await supabase
          .from('chat_messages')
          .insert([minimalData])
          .select();
          
        if (retryError) {
          throw retryError;
        }
        
        console.log('Successfully inserted with minimal data');
        return {
          ...data,
          publicUrl: publicUrlData.publicUrl,
          contentType: contentType,
          chatMessage: retryData[0]
        };
      }
      
      throw chatMessageError;
    }
    
    console.log(`Successfully uploaded file and created chat message for chatId ${chatId}`);
    return {
      ...data,
      publicUrl: publicUrlData.publicUrl,
      contentType: contentType,
      chatMessage: insertedData[0]
    };
  } catch (error) {
    console.error(`Error in uploadToSupabase for chatId ${chatId}:`, error);
    throw error;
  }
}

app.post('/webhook/chat-message', async (req, res) => {
  const requestId = Math.random().toString(36).substring(2, 15);
  
  try {
    const payload = req.body;
    console.log(`Processing webhook request ${requestId}:`, payload);
    
    const messageRecord = payload.record;
    const messageText = messageRecord.text;
    const chatId = messageRecord.chat_id;
    const messageRole = messageRecord.role;
    
    // Get message type from payload or default to 'audio'
    const messageType = messageRecord.message_type;
    const voice = messageRecord.voice || payload.voice || 'Kore';
    
    if (messageRole.toLowerCase() !== 'user') {
      console.log(`Skipping non-user message for requestId ${requestId}, role: ${messageRole}`);
      return res.status(200).json({
        message: 'Skipping non-user message',
        requestId
      });
    }
    
    // Fetch enhanced chat context with all messages
    const chatData = await fetchChatContext(chatId, messageText, null);
    
    const responseFileName = `response_${uuidv4()}`;
    
    // Call Python function with the enhanced context that includes all messages
    const pythonResult = await callPythonFunction(messageText, chatData.context || '', responseFileName, messageType, voice);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let uploadResult = null;
    
    // Handle audio response
    if (pythonResult.message_type === 'audio') {
      // Use the audio file path from Python output
      const audioFilePath = pythonResult.audio_file;
      
      if (!audioFilePath || !fs.existsSync(audioFilePath)) {
        console.error(`Audio file not found at path: ${audioFilePath} for requestId ${requestId}`);
        throw new Error('Audio file not found after Python script execution');
      }
      
      const stats = fs.statSync(audioFilePath);
      if (stats.size === 0) {
        console.error(`Audio file is empty at path: ${audioFilePath} for requestId ${requestId}`);
        throw new Error('Audio file is empty');
      }
      
      // Upload to Supabase with all Python result data
      uploadResult = await uploadToSupabase(audioFilePath, chatId, pythonResult, 'audio');
      
      // Clean up the audio file
      if (fs.existsSync(audioFilePath)) {
        fs.unlinkSync(audioFilePath);
      }
    } else {
      // Handle text-only response with graceful error handling
      const chatMessageData = buildChatMessageData(chatId, pythonResult, 'text');
      
      const { data: insertedData, error: chatMessageError } = await supabase
        .from('chat_messages')
        .insert([chatMessageData])
        .select();
      
      if (chatMessageError) {
        console.error(`Failed to insert chat message for chatId ${chatId}:`, chatMessageError);
        
        // If it's a column not found error, try with minimal data
        if (chatMessageError.code === 'PGRST204') {
          console.log('Attempting text insert with minimal data due to missing columns...');
          const minimalData = {
            chat_id: chatId,
            role: 'AI',
            text: pythonResult.response_text || '',
            message_type: 'text'
          };
          
          const { data: retryData, error: retryError } = await supabase
            .from('chat_messages')
            .insert([minimalData])
            .select();
            
          if (retryError) {
            throw retryError;
          }
          
          uploadResult = {
            chatMessage: retryData[0],
            publicUrl: null
          };
        } else {
          throw chatMessageError;
        }
      } else {
        uploadResult = {
          chatMessage: insertedData[0],
          publicUrl: null
        };
      }
    }
    
    // Update the chat context with the updated context from Python
    const { error: updateError } = await supabase
      .from('chats')
      .update({
        context: pythonResult.updated_context,
        updated_at: new Date().toISOString()
      })
      .eq('chat_id', chatId);
    
    if (updateError) {
      console.error(`Failed to update chat context for chatId ${chatId}:`, updateError);
    }
    
    console.log(`Successfully processed webhook request ${requestId} for chatId ${chatId}. Message history length: ${chatData.messageHistory?.length || 0}`);
    
    // Build comprehensive response
    const response = {
      success: true,
      message: `Message processed and ${pythonResult.message_type} response generated`,
      requestId,
      messageType: pythonResult.message_type,
      responseText: pythonResult.response_text,
      chatMessage: uploadResult.chatMessage,
      tokens: {
        total_tokens: pythonResult.total_tokens || 0,
        text_tokens: pythonResult.text_tokens || 0
      },
      processing_time_ms: pythonResult.processing_time_ms || 0,
      timestamp: pythonResult.timestamp,
      messageHistoryCount: chatData.messageHistory?.length || 0,
      // Add structured learning data to response
      structuredData: {
        mastery_level: pythonResult.mastery_level || 'progressing',
        has_follow_up: pythonResult.has_follow_up !== undefined ? pythonResult.has_follow_up : true,
        follow_up_question: pythonResult.follow_up_question || '',
        generation_success: pythonResult.generation_success !== undefined ? pythonResult.generation_success : true
      }
    };
    
    // Add audio-specific fields
    if (pythonResult.message_type === 'audio') {
      response.audioUrl = uploadResult.publicUrl;
      response.tokens.audio_tokens = pythonResult.audio_tokens || 0;
      response.voice_used = pythonResult.voice_used;
      if (pythonResult.duration_seconds) {
        response.duration_seconds = pythonResult.duration_seconds;
      }
    } else {
      response.model_used = pythonResult.model_used;
    }
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error(`Error processing webhook request ${requestId}:`, error);
    res.status(500).json({
      error: 'Failed to process chat message',
      details: error.message,
      requestId
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'agentic-study-buddy'
  });
});

// Debug endpoint to test Python integration
app.post('/debug/test-python', async (req, res) => {
  const { message = "Hello, test message", context = "", messageType = "text" } = req.body;
  
  try {
    const result = await callPythonFunction(message, context, null, messageType);
    res.status(200).json({
      success: true,
      pythonResult: result,
      structuredDataExtracted: {
        mastery_level: result.mastery_level,
        has_follow_up: result.has_follow_up,
        follow_up_question: result.follow_up_question,
        generation_success: result.generation_success
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// New endpoint to test database schema
app.get('/debug/test-db-schema', async (req, res) => {
  try {
    // Test inserting a minimal record to see what columns exist
    const testData = {
      chat_id: 'test-schema-check',
      role: 'AI',
      text: 'Schema test',
      message_type: 'text'
    };
    
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([testData])
      .select();
    
    if (error) {
      // Clean up test record if it was inserted
      await supabase
        .from('chat_messages')
        .delete()
        .eq('chat_id', 'test-schema-check');
        
      res.status(200).json({
        schemaStatus: 'missing_columns',
        error: error.message,
        recommendation: 'Run the SQL schema update commands'
      });
    } else {
      // Clean up successful test
      await supabase
        .from('chat_messages')
        .delete()
        .eq('chat_id', 'test-schema-check');
        
      res.status(200).json({
        schemaStatus: 'basic_columns_exist',
        message: 'Basic schema is working'
      });
    }
  } catch (error) {
    res.status(500).json({
      schemaStatus: 'error',
      error: error.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server started successfully on port ${port}`);
  console.log(`Enhanced Agentic Study Buddy API ready with graceful schema handling`);
  console.log(`Visit http://localhost:${port}/debug/test-db-schema to check database schema`);
});