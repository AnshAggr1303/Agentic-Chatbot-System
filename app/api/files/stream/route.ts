import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chat_id = searchParams.get('chat_id');
    const message_id = searchParams.get('message_id');
    const filename = searchParams.get('filename');

    if (!chat_id || !message_id || !filename) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const filePath = `responses/${chat_id}/${message_id}/${filename}`;
    
    console.log('🎵 Streaming audio file:', filePath);

    // Download the file from Supabase storage
    const { data, error } = await supabase.storage
      .from('chat-responses')
      .download(filePath);

    if (error) {
      console.error('❌ Error downloading file:', error);
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Convert blob to buffer
    const buffer = await data.arrayBuffer();

    // Determine content type based on file extension
    const getContentType = (filename: string) => {
      const ext = filename.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'mp3': return 'audio/mpeg';
        case 'wav': return 'audio/wav';
        case 'ogg': return 'audio/ogg';
        case 'm4a': return 'audio/mp4';
        default: return 'audio/mpeg';
      }
    };

    // Return the audio file with proper headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': getContentType(filename),
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      },
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}