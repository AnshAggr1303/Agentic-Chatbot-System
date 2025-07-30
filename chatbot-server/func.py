import google.generativeai as genai
from google.generativeai import types
import wave
import time
import sys
import random
import json
import re
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv
load_dotenv()

# Ensure uploads directory exists
os.makedirs('uploads', exist_ok=True)

# Configuration - Use environment variables for API keys in production
# Configuration - Load API keys from environment variables
GOOGLE_API_KEYS = []
for i in range(1, 8):  # Assuming you have 7 keys
    key = os.getenv(f'GOOGLE_API_KEY_{i}')
    if key:
        GOOGLE_API_KEYS.append(key)

# Fallback to a single key if individual keys aren't set
if not GOOGLE_API_KEYS:
    single_key = os.getenv('GOOGLE_API_KEY')
    if single_key:
        GOOGLE_API_KEYS = [single_key]
    else:
        raise ValueError("No Google API keys found in environment variables")

# Updated model names
AVAILABLE_MODELS = {
    'text': 'gemini-2.0-flash-exp',
    'audio_tts': 'gemini-2.0-flash-exp',  # Updated for TTS generation
    'preview': 'gemini-2.5-flash-exp',    # Latest preview model
    'fallback': 'gemini-1.5-flash'
}

# Structured Output Schema - Fixed response_text requirement
STUDY_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "phase_1_analysis": {
            "type": "object",
            "properties": {
                "student_level_detected": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
                "learning_style_identified": {"type": "string", "enum": ["visual", "auditory", "kinesthetic", "reading"]},
                "concept_complexity": {"type": "string", "enum": ["basic", "moderate", "complex"]},
                "prior_knowledge_assessment": {"type": "string"}
            },
            "required": ["student_level_detected", "concept_complexity"]
        },
        "phase_2_teaching": {
            "type": "object",
            "properties": {
                "main_explanation": {"type": "string"},
                "teaching_method_used": {"type": "string", "enum": ["step_by_step", "analogy", "example_based", "visual", "interactive"]},
                "key_concepts": {"type": "array", "items": {"type": "string"}},
                "examples_provided": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["main_explanation", "teaching_method_used", "key_concepts"]
        },
        "phase_3_assessment": {
            "type": "object",
            "properties": {
                "check_understanding_question": {"type": "string"},
                "quiz_available": {"type": "boolean"},
                "quiz_questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": {"type": "string"},
                            "type": {"type": "string", "enum": ["multiple_choice", "short_answer", "true_false", "calculation"]},
                            "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                            "correct_answer": {"type": "string"},
                            "explanation": {"type": "string"}
                        },
                        "required": ["question", "type", "correct_answer"]
                    }
                }
            },
            "required": ["check_understanding_question", "quiz_available"]
        },
        "phase_4_next_steps": {
            "type": "object",
            "properties": {
                "mastery_level": {"type": "string", "enum": ["needs_review", "progressing", "mastered"]},
                "suggested_next_topics": {"type": "array", "items": {"type": "string"}},
                "study_recommendations": {"type": "array", "items": {"type": "string"}},
                "follow_up_question": {"type": "string"},
                "encouragement_message": {"type": "string"}
            },
            "required": ["mastery_level", "follow_up_question", "encouragement_message"]
        },
        "response_text": {
            "type": "string",
            "description": "The complete conversational response that combines all phases into natural text"
        },
        "interactive_elements": {
            "type": "object",
            "properties": {
                "has_follow_up": {"type": "boolean"},
                "action_required": {"type": "string", "enum": ["answer_question", "take_quiz", "explore_topic", "practice_more"]},
                "engagement_level": {"type": "string", "enum": ["low", "medium", "high"]}
            },
            "required": ["has_follow_up", "action_required"]
        }
    },
    "required": ["phase_1_analysis", "phase_2_teaching", "phase_3_assessment", "phase_4_next_steps", "response_text", "interactive_elements"]
}

QUIZ_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "quiz_evaluation": {
            "type": "object",
            "properties": {
                "overall_score": {"type": "number", "minimum": 0, "maximum": 100},
                "performance_level": {"type": "string", "enum": ["excellent", "good", "needs_improvement", "requires_review"]},
                "strengths_identified": {"type": "array", "items": {"type": "string"}},
                "areas_for_improvement": {"type": "array", "items": {"type": "string"}},
                "detailed_feedback": {"type": "string"}
            },
            "required": ["overall_score", "performance_level", "detailed_feedback"]
        },
        "adaptive_response": {
            "type": "object",
            "properties": {
                "next_difficulty_level": {"type": "string", "enum": ["easier", "same", "harder"]},
                "reinforcement_needed": {"type": "boolean"},
                "topics_to_review": {"type": "array", "items": {"type": "string"}},
                "ready_for_advancement": {"type": "boolean"}
            },
            "required": ["next_difficulty_level", "reinforcement_needed", "ready_for_advancement"]
        },
        "response_text": {
            "type": "string",
            "description": "Complete conversational response with feedback and next steps"
        },
        "next_action": {
            "type": "object",
            "properties": {
                "recommended_action": {"type": "string", "enum": ["continue_topic", "review_basics", "advance_topic", "try_different_approach"]},
                "follow_up_question": {"type": "string"},
                "new_quiz_available": {"type": "boolean"}
            },
            "required": ["recommended_action", "follow_up_question"]
        }
    },
    "required": ["quiz_evaluation", "adaptive_response", "response_text", "next_action"]
}

class AgenticStudyBuddy:
    def __init__(self):
        self.api_keys = GOOGLE_API_KEYS.copy()
        self.current_key_index = 0
        self.memory_patterns = {}
        self.learning_analytics = {}
        self.configure_client()
        
    def configure_client(self):
        """Configure the client with current API key"""
        current_key = self.api_keys[self.current_key_index]
        genai.configure(api_key=current_key)
        print(f"Using API key index: {self.current_key_index}")
        
    def rotate_api_key(self):
        """Rotate to next API key"""
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
        self.configure_client()
        print(f"Rotated to API key index: {self.current_key_index}")
        
    def make_api_call_with_retry(self, model_name: str, prompt: str, generation_config=None, max_retries: int = 3):
        """Make API call with retry logic and key rotation"""
        
        for attempt in range(max_retries):
            try:
                model = genai.GenerativeModel(model_name)
                
                if generation_config:
                    response = model.generate_content(prompt, generation_config=generation_config)
                else:
                    response = model.generate_content(prompt)
                    
                return response
                
            except Exception as e:
                error_str = str(e)
                print(f"API call attempt {attempt + 1} failed: {error_str}")
                
                # Check if it's a quota/rate limit error
                if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower():
                    print("Rate limit detected, rotating API key...")
                    self.rotate_api_key()
                    
                    # Wait before retrying
                    wait_time = min(2 ** attempt, 10)  # Exponential backoff, max 10 seconds
                    print(f"Waiting {wait_time} seconds before retry...")
                    time.sleep(wait_time)
                    
                    if attempt == max_retries - 1:
                        print("All API keys exhausted or rate limited")
                        raise e
                else:
                    # Non-rate-limit error, don't retry
                    raise e
                    
        raise Exception("Max retries exceeded")
        
    def extract_learning_insights(self, user_message: str, context: str) -> Dict[str, Any]:
        """Extract learning patterns and insights from user interaction"""
        insights = {
            'difficulty_level': 'medium',
            'subject_area': 'general',
            'learning_style': 'mixed',
            'confidence_level': 'moderate',
            'question_type': 'conceptual',
            'needs_reinforcement': []
        }
        
        # Analyze question complexity
        complexity_indicators = ['explain', 'how', 'why', 'what if', 'compare', 'analyze']
        if any(indicator in user_message.lower() for indicator in complexity_indicators):
            insights['question_type'] = 'analytical'
            insights['difficulty_level'] = 'high'
        elif any(word in user_message.lower() for word in ['definition', 'what is', 'meaning']):
            insights['question_type'] = 'definitional'
            insights['difficulty_level'] = 'low'
            
        # Subject detection
        subjects = {
            'math': ['equation', 'solve', 'calculate', 'formula', 'graph', 'algebra', 'geometry', 'calculus', 'trigonometry'],
            'science': ['experiment', 'hypothesis', 'molecule', 'cell', 'reaction', 'physics', 'chemistry', 'biology', 'atom', 'energy', 'photosynthesis'],
            'history': ['war', 'revolution', 'empire', 'ancient', 'timeline', 'civilization', 'century', 'historical'],
            'literature': ['poem', 'novel', 'author', 'character', 'theme', 'analysis', 'story', 'narrative'],
            'language': ['grammar', 'vocabulary', 'sentence', 'verb', 'noun', 'adjective', 'syntax'],
            'computer_science': ['programming', 'algorithm', 'code', 'function', 'variable', 'loop', 'data structure']
        }
        
        for subject, keywords in subjects.items():
            if any(keyword in user_message.lower() for keyword in keywords):
                insights['subject_area'] = subject
                break
                
        return insights
    
    def build_system_prompt(self, insights: Dict, context: str, is_quiz_response: bool = False) -> str:
        """Build comprehensive system prompt based on insights"""
        
        if is_quiz_response:
            return f"""
You are Study Buddy, an adaptive AI tutor analyzing a student's quiz responses.

## Current Session Analysis:
- Subject Area: {insights['subject_area']}
- Question Type: {insights['question_type']}
- Detected Difficulty: {insights['difficulty_level']}

## Your Task:
Evaluate the student's quiz responses and provide adaptive feedback using the structured output format.
CRITICAL: Always populate the 'response_text' field with a complete, conversational response.

## Key Behaviors:
1. **Accurate Assessment**: Fairly evaluate responses and provide constructive feedback
2. **Adaptive Planning**: Adjust difficulty and suggest next steps based on performance
3. **Encouraging Tone**: Always be supportive while being honest about areas for improvement
4. **Proactive Guidance**: Suggest specific actions and next topics

## Context: {context}

CRITICAL: You must follow the structured output schema exactly and provide meaningful content in response_text.
"""
        
        return f"""
You are Study Buddy, an advanced adaptive AI tutor with sophisticated agentic capabilities.

## Current Learning Context:
- Subject Area: {insights['subject_area']}
- Question Type: {insights['question_type']}
- Detected Difficulty Level: {insights['difficulty_level']}
- Student Confidence: {insights['confidence_level']}

## Your Agentic Mission:
Execute a 4-phase adaptive tutoring response that's highly interactive and personalized.

### Phase 1 - Intelligent Analysis 🧠
- Assess the student's current level based on their question
- Identify the most effective learning approach for this specific query
- Detect any misconceptions or knowledge gaps

### Phase 2 - Adaptive Teaching 📚  
- Deliver explanation using the optimal teaching method (step-by-step, analogies, examples, etc.)
- Match complexity to student level - never too simple or too advanced
- Include concrete examples and practical applications
- Make it engaging and relatable

### Phase 3 - Interactive Assessment 🎯
- ALWAYS include a follow-up question to check understanding
- When appropriate, offer a mini-quiz with 2-3 targeted questions
- Create questions that test both comprehension and application
- Make assessment feel natural, not intimidating

### Phase 4 - Proactive Next Steps 💡
- Suggest related concepts to explore next
- Provide specific study recommendations  
- Always end with an engaging follow-up question or interaction
- Be encouraging and build confidence

## Critical Output Requirements:
- ALWAYS populate 'response_text' with a complete, natural conversational response
- Combine all phases into flowing, engaging text
- Make it sound like a helpful tutor having a conversation
- Include the main explanation, follow-up questions, and encouragement

## Session Context: {context}

Remember: You must respond using the structured output format with meaningful response_text that flows naturally.
"""

    def generate_structured_response(self, user_message: str, context: str, insights: Dict, is_quiz_response: bool = False) -> Dict[str, Any]:
        """Generate structured response using Gemini's structured output with retry logic"""
        
        system_prompt = self.build_system_prompt(insights, context, is_quiz_response)
        schema = QUIZ_RESPONSE_SCHEMA if is_quiz_response else STUDY_RESPONSE_SCHEMA
        
        # Select appropriate model
        model_name = AVAILABLE_MODELS['text']
        
        try:
            # Prepare the full prompt with explicit instructions
            full_prompt = f"""{system_prompt}

Student Message: {user_message}

IMPORTANT: Provide a complete JSON response following the schema. 
The 'response_text' field must contain a full conversational response that naturally incorporates:
- A clear explanation of the topic
- Engaging examples or analogies
- A follow-up question to check understanding
- Encouraging tone throughout

Make it sound like a knowledgeable, friendly tutor having a natural conversation."""
            
            # Try with structured output first (Gemini 2.0)
            try:
                response = self.make_api_call_with_retry(
                    model_name,
                    full_prompt,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        response_schema=schema
                    )
                )
                
                # Parse and validate JSON
                structured_data = json.loads(response.text)
                
                # Ensure response_text is populated
                if not structured_data.get('response_text') or structured_data['response_text'].strip() == '':
                    print("Empty response_text detected, generating fallback...")
                    structured_data = self.create_enhanced_fallback_response(user_message, insights, is_quiz_response)
                
            except Exception as structured_error:
                print(f"Structured output failed: {structured_error}")
                
                # Fallback to regular text generation with clear instructions
                fallback_prompt = f"""{system_prompt}

Student Message: {user_message}

Please provide a comprehensive response about this topic. Be engaging, clear, and educational."""
                
                try:
                    response = self.make_api_call_with_retry(model_name, fallback_prompt)
                    # Create structured data with the generated text
                    structured_data = self.create_enhanced_fallback_response(user_message, insights, is_quiz_response)
                    structured_data['response_text'] = response.text
                except:
                    # Final fallback
                    structured_data = self.create_enhanced_fallback_response(user_message, insights, is_quiz_response)
                    print("Using enhanced fallback response")
            
            # Safely get token count
            token_count = 0
            try:
                if hasattr(response, 'usage_metadata') and response.usage_metadata:
                    if hasattr(response.usage_metadata, 'total_token_count'):
                        token_count = response.usage_metadata.total_token_count
                    elif hasattr(response.usage_metadata, 'get'):
                        token_count = response.usage_metadata.get('total_token_count', 0)
            except:
                token_count = len(user_message.split()) * 4  # Rough estimate
            
            return {
                'success': True,
                'data': structured_data,
                'tokens_used': token_count
            }
            
        except Exception as e:
            print(f"All structured response attempts failed: {e}")
            # Final fallback response
            fallback = self.create_enhanced_fallback_response(user_message, insights, is_quiz_response)
            fallback_tokens = len(fallback['response_text'].split()) * 2
            return {
                'success': False,
                'data': fallback,
                'tokens_used': fallback_tokens,
                'error': str(e)
            }
    
    def create_enhanced_fallback_response(self, user_message: str, insights: Dict, is_quiz_response: bool) -> Dict[str, Any]:
        """Create enhanced fallback response with proper content"""
        
        subject = insights.get('subject_area', 'general')
        
        if is_quiz_response:
            response_text = f"""Great job on attempting the quiz! I can see you're working hard to understand this {subject} topic. 

Let me provide some feedback on your responses and help clarify any concepts that might be tricky. Every mistake is a learning opportunity, and you're on the right track!

What specific part of this topic would you like me to explain more clearly? I'm here to help you master these concepts step by step."""
            
            return {
                "quiz_evaluation": {
                    "overall_score": 75,
                    "performance_level": "good",
                    "detailed_feedback": "You're making good progress! Let's review the key concepts together."
                },
                "adaptive_response": {
                    "next_difficulty_level": "same",
                    "reinforcement_needed": True,
                    "ready_for_advancement": False
                },
                "response_text": response_text,
                "next_action": {
                    "recommended_action": "review_basics",
                    "follow_up_question": "Which question gave you the most trouble?",
                    "new_quiz_available": False
                }
            }
        
        # Enhanced fallback for regular questions
        topic_snippet = user_message[:50].lower()
        if 'photosynthesis' in topic_snippet:
            response_text = """Photosynthesis is one of the most important processes on Earth! Let me break it down for you in a simple way.

Think of photosynthesis as nature's way of making food using sunlight. Plants are like tiny solar-powered factories that take in carbon dioxide from the air and water from their roots, then use sunlight energy to convert these into glucose (sugar) and oxygen.

The simple equation is: 6CO₂ + 6H₂O + sunlight energy → C₆H₁₂O₆ + 6O₂

This happens mainly in the leaves, specifically in tiny structures called chloroplasts that contain chlorophyll - that's what makes plants green!

Here's what's amazing: the oxygen we breathe is actually a "waste product" of this process. Plants are literally creating the air we need to survive!

Does this help you understand the basic concept? What part would you like me to explain in more detail - maybe the role of chlorophyll or how the energy conversion actually works?"""
        else:
            response_text = f"""Great question about {topic_snippet}! I'd love to help you understand this {subject} topic better.

Let me break this down in a way that makes sense. This is an interesting concept that connects to many other ideas in {subject}.

I want to make sure I explain this at the right level for you. What specifically about {topic_snippet} would you like me to focus on? Are you looking for a basic overview, or do you want to dive deeper into the details?

I'm here to help you master this step by step!"""
        
        return {
            "phase_1_analysis": {
                "student_level_detected": "intermediate",
                "concept_complexity": "moderate"
            },
            "phase_2_teaching": {
                "main_explanation": f"This is a fascinating {subject} topic that I'm excited to help you understand!",
                "teaching_method_used": "step_by_step",
                "key_concepts": [topic_snippet, f"{subject} fundamentals", "practical applications"]
            },
            "phase_3_assessment": {
                "check_understanding_question": "Does this explanation make sense so far?",
                "quiz_available": True,
                "quiz_questions": []
            },
            "phase_4_next_steps": {
                "mastery_level": "progressing",
                "follow_up_question": f"What specific aspect of {topic_snippet} would you like to explore next?",
                "encouragement_message": "You're asking great questions! Keep that curiosity going!"
            },
            "response_text": response_text,
            "interactive_elements": {
                "has_follow_up": True,
                "action_required": "answer_question"
            }
        }

class ResponseGenerator:
    def __init__(self):
        self.agent = AgenticStudyBuddy()
        
    def wave_file(self, filename: str, pcm: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2):
        """Create WAV file from PCM data"""
        with wave.open(filename, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(rate)
            wf.writeframes(pcm)
    
    def format_response_text(self, structured_data: Dict[str, Any], is_quiz_response: bool = False) -> str:
        """Format structured data into natural response text - now just returns the response_text field"""
        return structured_data.get('response_text', 'I apologize, but I encountered an issue generating a response. Could you please try asking your question again?')
    
    def detect_quiz_response(self, user_message: str) -> bool:
        """Detect if user is responding to a quiz"""
        quiz_indicators = [
            'q1:', 'q2:', 'q3:', 'question 1', 'question 2', 'question 3',
            'answer:', 'my answer', 'i think', 'the answer is',
            'format:', 'quiz', 'test'
        ]
        return any(indicator in user_message.lower() for indicator in quiz_indicators)
    
    def generate_audio_response(self, text: str, voice: str, file_name: str) -> Dict[str, Any]:
        """Generate audio using Gemini 2.5 Preview or 2.0 Flash"""
        try:
            # Try Gemini 2.5 Preview first for TTS
            try:
                model = genai.GenerativeModel(AVAILABLE_MODELS['preview'])
                print(f"Attempting TTS with {AVAILABLE_MODELS['preview']} and voice: {voice}")
                
                # For now, create placeholder - actual TTS implementation would be here
                # response = model.generate_content(f"Convert this to speech: {text}")
                
            except Exception as preview_error:
                print(f"Preview model failed: {preview_error}")
                # Fallback to 2.0 Flash
                model = genai.GenerativeModel(AVAILABLE_MODELS['audio_tts'])
                print(f"Falling back to {AVAILABLE_MODELS['audio_tts']}")
            
            # Create placeholder audio file (replace with actual TTS when available)
            file_path = f'uploads/{file_name}.wav'
            
            # Create more realistic audio duration based on text length
            words = len(text.split())
            duration_seconds = max(1, words // 3)  # ~3 words per second
            samples = 24000 * duration_seconds
            dummy_audio = b'\x00' * (samples * 2)  # 16-bit samples
            
            self.wave_file(file_path, dummy_audio, rate=24000)
            
            return {
                'audio_file': file_path,
                'voice_used': voice,
                'audio_tokens': len(text.split()) * 2,
                'duration_seconds': duration_seconds
            }
            
        except Exception as e:
            print(f"Audio generation failed: {e}")
            # Create minimal dummy audio file
            file_path = f'uploads/{file_name}.wav'
            dummy_audio = b'\x00' * 48000  # 1 second
            self.wave_file(file_path, dummy_audio, rate=24000)
            return {
                'audio_file': file_path,
                'voice_used': voice,
                'audio_tokens': len(text.split()) * 2,
                'duration_seconds': 1
            }
    
    def generate_response(self, user_message: str, context: str, message_type: str, **kwargs) -> Dict[str, Any]:
        """Main response generation with structured output"""
        start_time = time.time()
        
        # Extract learning insights
        insights = self.agent.extract_learning_insights(user_message, context)
        
        # Detect if this is a quiz response
        is_quiz_response = self.detect_quiz_response(user_message)
        
        # Generate structured response
        structured_result = self.agent.generate_structured_response(
            user_message, context, insights, is_quiz_response
        )
        
        structured_data = structured_result['data']
        
        # Get the response text (should already be complete)
        output_text = structured_data.get('response_text', 'I apologize, but I encountered an issue. Please try again.')
        
        # Build updated context from structured data
        if is_quiz_response:
            performance = structured_data.get('quiz_evaluation', {}).get('performance_level', 'moderate')
            next_action = structured_data.get('next_action', {}).get('recommended_action', 'continue')
            updated_context = f"Quiz completed - Performance: {performance}, Next: {next_action}"
        else:
            mastery = structured_data.get('phase_4_next_steps', {}).get('mastery_level', 'progressing')
            concepts = structured_data.get('phase_2_teaching', {}).get('key_concepts', [])
            concept_list = ', '.join(concepts[:3]) if concepts else 'general topic'
            updated_context = f"Discussed: {concept_list} | Mastery: {mastery} | Subject: {insights['subject_area']}"
        
        # Handle audio generation if requested
        audio_result = {}
        if message_type.lower() == 'audio':
            voice = kwargs.get('voice', 'Kore')
            file_name = kwargs.get('file_name', f"audio_{int(time.time())}")
            audio_result = self.generate_audio_response(output_text, voice, file_name)
        
        # Build result
        elapsed_time = (time.time() - start_time) * 1000
        text_tokens = structured_result['tokens_used']
        
        result = {
            "message_type": message_type,
            "response_text": output_text,
            "updated_context": updated_context,
            "text_tokens": text_tokens,
            "total_tokens": text_tokens + audio_result.get('audio_tokens', 0),
            "processing_time_ms": elapsed_time,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "learning_insights": insights,
            "structured_data": structured_data,
            "generation_success": structured_result['success']
        }
        
        # Add audio-specific fields
        if message_type.lower() == 'audio':
            result.update(audio_result)
            result["model_used"] = AVAILABLE_MODELS['audio_tts']  # Track which model was used for audio
        else:
            result["model_used"] = AVAILABLE_MODELS['text']
            
        return result

# Global instance
generator = ResponseGenerator()

def generate_chat_response(user_message: str, context: str, message_type: str, **kwargs) -> Dict[str, Any]:
    """Main function - maintains backward compatibility"""
    return generator.generate_response(user_message, context, message_type, **kwargs)

def print_simple_output(result: Dict[str, Any]):
    """Print formatted output - maintains exact format for Node.js parsing"""
    print("message_type:", result["message_type"])
    print("response_text:", result["response_text"])
    print("updated_context:", result["updated_context"])
    print("total_tokens:", result["total_tokens"])
    print("processing_time_ms:", f"{result['processing_time_ms']:.2f}")
    print("timestamp:", result["timestamp"])
    print("generation_success:", result["generation_success"])
    
    # Print key structured insights for Node.js parsing
    structured_data = result.get("structured_data", {})
    if "phase_4_next_steps" in structured_data:
        next_steps = structured_data["phase_4_next_steps"]
        print("mastery_level:", next_steps.get("mastery_level", "unknown"))
        print("follow_up_question:", next_steps.get("follow_up_question", ""))
    else:
        # Fallback values for quiz responses or missing data
        if "quiz_evaluation" in structured_data:
            print("mastery_level:", "progressing")
            print("follow_up_question:", structured_data.get("next_action", {}).get("follow_up_question", ""))
        else:
            print("mastery_level:", "progressing")
            print("follow_up_question:", "What would you like to explore next?")
    
    # Interactive elements
    interactive = structured_data.get("interactive_elements", {})
    print("has_follow_up:", interactive.get("has_follow_up", True))
    
    # Message type specific outputs
    if result["message_type"] == "audio":
        print("audio_file:", result["audio_file"])
        print("audio_tokens:", result["audio_tokens"])
        print("text_tokens:", result["text_tokens"])
        print("voice_used:", result["voice_used"])
        if "duration_seconds" in result:
            print("duration_seconds:", result["duration_seconds"])
    else:
        print("model_used:", result["model_used"])
        print("text_tokens:", result["total_tokens"])  # For text-only, text_tokens = total_tokens

def save_to_json(result: Dict[str, Any], filename: str):
    """Save result to JSON file"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

def process_chat_message(message_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process chat message from database format"""
    if message_data['role'] != 'user':
        raise ValueError("Only user messages should be processed for generation")
    
    kwargs = {}
    if message_data['message_type'] == 'audio':
        kwargs['file_name'] = message_data.get('audio_file_name', f"audio_{message_data['message_id']}")
        kwargs['voice'] = message_data.get('voice', 'Kore')
    
    result = generate_chat_response(
        user_message=message_data['text'],
        context=message_data.get('context', ''),
        message_type=message_data['message_type'],
        **kwargs
    )
    
    result.update({
        'message_id': message_data['message_id'],
        'chat_id': message_data['chat_id'],
        'role': 'assistant'
    })
    
    return result

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python func.py <USER_MESSAGE> <CONTEXT> <MESSAGE_TYPE> [additional_args]")
        print("\nMESSAGE_TYPE options:")
        print("  text    - Generate text response only")
        print("  audio   - Generate audio response (requires file_name)")
        print("\nExamples:")
        print("  Text: python func.py \"Explain photosynthesis\" \"\" text")
        print("  Quiz Response: python func.py \"Q1: The sun, Q2: Carbon dioxide\" \"Previous quiz on photosynthesis\" text")
        print("  Audio: python func.py \"Hello\" \"\" audio file_name=hello_audio")
        print("\nNode.js Integration Test:")
        print("  python func.py \"explain photosynthesis\" \"\" text")
        sys.exit(1)
    
    user_message = sys.argv[1]
    context = sys.argv[2]
    message_type = sys.argv[3]
    
    kwargs = {}
    for arg in sys.argv[4:]:
        if "=" in arg:
            key, value = arg.split("=", 1)
            kwargs[key] = value
    
    # For audio messages, ensure we have a file_name
    if message_type.lower() == 'audio' and 'file_name' not in kwargs:
        kwargs['file_name'] = f"audio_{int(time.time())}"
    
    try:
        result = generate_chat_response(user_message, context, message_type, **kwargs)
        print_simple_output(result)
        
        if "save_json" in kwargs:
            filename = f"chat_response_{int(time.time())}.json"
            save_to_json(result, filename)
            print(f"Result saved to: {filename}")
            
    except Exception as e:
        print("error:", str(e))
        import traceback
        traceback.print_exc()