import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qlphizfsggoinjxmxjep.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFscGhpemZzZ2dvaW5qeG14amVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4Njc5MTQsImV4cCI6MjA2NzQ0MzkxNH0.IcXKb6ug3hIuBJBziC47eC6meeZyi2do2yMyFy9Z4bY'
);

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    let chat_id = searchParams.get('chat_id');
    let message_id = searchParams.get('message_id');

    // Validate required parameters
    if (!chat_id || !message_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required parameters: chat_id and message_id' 
        },
        { status: 400 }
      );
    }

    console.log('🔍 Retrieving files for:', {
      chat_id,
      message_id,
      storagePath: `responses/${chat_id}/${message_id}`
    });

    const isDummy = false;
    
    if(isDummy){
      chat_id = "hello";
      message_id = "hello";
    }

    // List files in the specific chat/message folder
    console.log('☁️ Querying Supabase storage...');
    const { data, error } = await supabase.storage
      .from('responses')
      .list(`responses/${chat_id}/${message_id}`);
    
    if (error) {
      console.log('❌ Supabase list error:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: error.message 
        },
        { status: 500 }
      );
    }
    
    console.log('✅ Files retrieved successfully');
    console.log('📊 Files found:', data ? data.length : 0);
    console.log('📄 File details:', JSON.stringify(data, null, 2));
    
    // Add download URLs for each file
    const filesWithUrls = data?.map(file => {
      const { data: urlData } = supabase.storage
        .from('responses')
        .getPublicUrl(`responses/${chat_id}/${message_id}/${file.name}`);
      
      return {
        ...file,
        url: urlData.publicUrl
      };
    }) || [];
    
    const responseData = {
      success: true,
      chat_id,
      message_id,
      files: filesWithUrls
    };
    
    console.log('📤 Sending file list response');
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}