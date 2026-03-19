const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * AI Response Generator
 * Generates responses using OpenAI, Claude, or local models
 * Incorporates user's persona for personalized responses
 */

class AIResponseGenerator {
  constructor() {
    this.provider = null;
    this.apiKey = null;
    this.model = null;
    this.personaPrompt = null;
    
    this.loadSettings();
  }
  
  loadSettings() {
    try {
      // Load from settings file
      const settingsPath = path.join(os.homedir(), '.openego_ai_settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        this.provider = settings.provider;
        this.apiKey = settings.apiKey;
        this.model = settings.model;
        console.log(`[AI] Loaded settings: ${this.provider}/${this.model}`);
      }
      
      // Load persona
      const personaPath = path.join(os.homedir(), '.openego_persona.json');
      if (fs.existsSync(personaPath)) {
        const personaData = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
        this.personaPrompt = personaData.persona?.aiPrompt || null;
        console.log('[AI] Loaded persona prompt');
      }
    } catch (e) {
      console.error('[AI] Error loading settings:', e);
    }
  }
  
  async generateResponse(message, context = {}) {
    if (!this.provider || !this.apiKey) {
      return { 
        success: false, 
        error: 'AI not configured. Please set up your API key in settings.'
      };
    }
    
    try {
      let response;
      
      switch (this.provider) {
        case 'openai':
          response = await this.generateOpenAI(message, context);
          break;
        case 'anthropic':
          response = await this.generateClaude(message, context);
          break;
        case 'google':
          response = await this.generateGemini(message, context);
          break;
        case 'local':
        case 'ollama':
          response = await this.generateLocal(message, context);
          break;
        default:
          return { success: false, error: 'Unknown provider: ' + this.provider };
      }
      
      return response;
      
    } catch (e) {
      console.error('[AI] Generation error:', e);
      return { success: false, error: e.message };
    }
  }
  
  async generateOpenAI(message, context) {
    const prompt = this.buildPrompt(message, context);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    return {
      success: true,
      text: data.choices[0].message.content,
      usage: data.usage
    };
  }
  
  async generateClaude(message, context) {
    const prompt = this.buildPrompt(message, context);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model || 'claude-3-haiku-20240307',
        max_tokens: 500,
        system: prompt.system,
        messages: [
          { role: 'user', content: prompt.user }
        ]
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    return {
      success: true,
      text: data.content[0].text,
      usage: data.usage
    };
  }
  
  async generateGemini(message, context) {
    const prompt = this.buildPrompt(message, context);
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model || 'gemini-pro'}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt.system + '\n\n' + prompt.user }
          ]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    return {
      success: true,
      text: data.candidates[0].content.parts[0].text
    };
  }
  
  async generateLocal(message, context) {
    const prompt = this.buildPrompt(message, context);
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model || 'llama3.1',
        prompt: prompt.system + '\n\n' + prompt.user,
        stream: false
      })
    });
    
    const data = await response.json();
    
    return {
      success: true,
      text: data.response
    };
  }
  
  buildPrompt(message, context) {
    // Build system prompt with persona
    let systemPrompt = this.personaPrompt || this.getDefaultPersona();
    
    // Add response guidelines
    systemPrompt += `

RESPONSE GUIDELINES:
- Be concise but friendly
- Match the tone of the incoming message
- If asking a question, answer it directly
- If scheduling, suggest specific times
- Keep responses under 150 words
- Don't use formal sign-offs unless the sender did`;
    
    // Build user prompt with context
    let userPrompt = `INCOMING MESSAGE:\n`;
    userPrompt += `From: ${message.from}\n`;
    if (message.subject) userPrompt += `Subject: ${message.subject}\n`;
    userPrompt += `Message: "${message.preview || message.fullContent}"\n\n`;
    userPrompt += `Write a reply to this message in my style.`;
    
    return {
      system: systemPrompt,
      user: userPrompt
    };
  }
  
  getDefaultPersona() {
    return `You are a helpful assistant writing on behalf of the user. 
Write in a professional but friendly tone. 
Be concise and to the point.`;
  }
  
  // Quick response generation without API (for testing)
  generateTemplateResponse(message) {
    const templates = {
      meeting: "I'd be happy to chat. What time works for you?",
      question: "That's a good question. Let me think about it and get back to you.",
      deadline: "I'll check my schedule and confirm by end of day.",
      thanks: "You're welcome! Happy to help.",
      default: "Thanks for reaching out. I'll get back to you soon."
    };
    
    const content = (message.preview || message.fullContent || '').toLowerCase();
    
    if (content.includes('meeting') || content.includes('call') || content.includes('zoom')) {
      return { success: true, text: templates.meeting, template: true };
    }
    if (content.includes('?')) {
      return { success: true, text: templates.question, template: true };
    }
    if (content.includes('deadline') || content.includes('due')) {
      return { success: true, text: templates.deadline, template: true };
    }
    if (content.includes('thank')) {
      return { success: true, text: templates.thanks, template: true };
    }
    
    return { success: true, text: templates.default, template: true };
  }
}

// Setup IPC handlers
function setupAIResponseHandlers() {
  const generator = new AIResponseGenerator();
  
  ipcMain.handle('generate-response', async (event, message, context) => {
    // If no API configured, return template response
    if (!generator.provider || !generator.apiKey) {
      console.log('[AI] No API configured, using template response');
      return generator.generateTemplateResponse(message);
    }
    
    return generator.generateResponse(message, context);
  });
  
  ipcMain.handle('test-ai-connection', async (event, settings) => {
    try {
      // Save settings
      const settingsPath = path.join(os.homedir(), '.openego_ai_settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(settings));
      
      // Reload generator with new settings
      generator.provider = settings.provider;
      generator.apiKey = settings.apiKey;
      generator.model = settings.model;
      
      // Test with simple prompt
      const testResponse = await generator.generateResponse({
        from: 'Test',
        preview: 'Hello, this is a test message.'
      });
      
      if (testResponse.success) {
        return { success: true, message: 'AI connection successful!' };
      } else {
        return { success: false, error: testResponse.error };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  
  // Handler to reload settings when changed
  ipcMain.handle('reload-ai-settings', () => {
    generator.loadSettings();
    return { success: true };
  });
}

module.exports = { setupAIResponseHandlers, AIResponseGenerator };
