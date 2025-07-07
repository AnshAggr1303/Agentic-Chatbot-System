// lib/services/speechService.ts
export interface AudioMessage {
  id: number;
  type: 'user' | 'ai';
  audioUrl?: string;
  text?: string;
  timestamp: Date;
}

export interface SpeechResponse {
  success: boolean;
  message?: AudioMessage;
  error?: string;
}

export class SpeechService {
  private static instance: SpeechService;
  
  public static getInstance(): SpeechService {
    if (!SpeechService.instance) {
      SpeechService.instance = new SpeechService();
    }
    return SpeechService.instance;
  }

  async processAudio(audioBlob: Blob, transcript: string): Promise<SpeechResponse> {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      formData.append('transcript', transcript);

      const response = await fetch('/api/speech', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        const aiMessage: AudioMessage = {
          id: Date.now(),
          type: 'ai',
          text: data.aiResponse,
          audioUrl: data.audioUrl,
          timestamp: new Date()
        };
        
        return { success: true, message: aiMessage };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Speech service error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async generateTTS(text: string): Promise<string | null> {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error('TTS generation failed');
      
      const data = await response.json();
      return data.audioUrl;
    } catch (error) {
      console.error('TTS error:', error);
      return null;
    }
  }
}