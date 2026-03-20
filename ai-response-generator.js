const fs = require('fs');
const path = require('path');
const os = require('os');
const { MessageClassifier } = require('./message-classifier');

/**
 * AI Response Generator with Message Classification
 * Handles Simple vs Complex messages differently
 * Complex messages use chain-of-thought with context retrieval
 */

class AIResponseGenerator {
  constructor() {
    this.provider = null;
    this.apiKey = null;
    this.model = null;
    this.personaPrompt = null;
    this.classifier = new MessageClassifier();
    
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
  
  /**
   * Main entry point - classifies message and generates appropriate response
   */
  async generateResponse(messageData) {
    const { message, sender, channel, previousMessages = [] } = messageData;
    
    console.log('[AI] Analyzing message:', message.substring(0, 50) + '...');
    
    // Step 1: Classify the message
    const classification = this.classifier.classify(message, sender);
    console.log(`[AI] Classification: ${classification.classification} (confidence: ${classification.confidence})`);
    
    // Step 2: Generate response based on classification
    if (classification.classification === 'simple') {
      return this.generateSimpleResponse(message, sender, classification);
    } else {
      return this.generateComplexResponse(message, sender, classification, previousMessages);
    }
  }
  
  /**
   * Generate response for simple messages
   * Direct, no context needed
   */
  async generateSimpleResponse(message, sender, classification) {
    const context = {
      classification: classification.classification,
      reasoning: classification.reasoning
    };
    
    const prompt = this.buildPrompt(message, context);
    return this.callAI(prompt, { maxTokens: 200 });
  }
  
  /**
   * Generate response for complex messages
   * Chain-of-thought: First understand context, then generate response
   */
  async generateComplexResponse(message, sender, classification, previousMessages) {
    console.log('[AI] Complex message detected - retrieving context...');
    
    // Step 1: Build context prompt with historical data
    const contextPrompt = this.classifier.buildContextPrompt(message, sender, classification);
    
    // Step 2: Chain-of-thought - First pass: Understand the context
    console.log('[AI] Step 1: Understanding context...');
    const understandingPrompt = {
      system: `You are an AI assistant helping to understand an email conversation. 
Your job is to analyze the incoming message and the provided context to create a brief summary of:
1. What topic is being discussed
2. What specific information is being requested
3. What previous context is relevant

Be concise - just the key facts.`,
      user: contextPrompt + `

TASK: Briefly summarize what this conversation is about and what the sender is asking. Focus on facts and context, not response formulation.`
    };
    
    const understanding = await this.callAI(understandingPrompt, { maxTokens: 300, temperature: 0.3 });
    
    if (!understanding.success) {
      console.error('[AI] Context understanding failed:', understanding.error);
      // Fall back to simple response
      return this.generateSimpleResponse(message, sender, classification);
    }
    
    console.log('[AI] Context understood:', understanding.text.substring(0, 100) + '...');
    
    // Step 3: Chain-of-thought - Second pass: Generate response with context
    console.log('[AI] Step 2: Generating response...');
    const responsePrompt = {
      system: this.buildPersonaSystemPrompt(),
      user: `CONVERSATION CONTEXT:
${understanding.text}

---

ORIGINAL MESSAGE FROM ${sender}:
"${message}"

---

TASK: Write a response that:
1. Addresses the specific questions/topics from the context above
2. References relevant dates, documents, or previous agreements mentioned
3. Uses the user's natural communication style (see persona above)
4. Is helpful and moves the conversation forward

If you don't have enough context to answer confidently, ask for clarification naturally.`
    };
    
    const finalResponse = await this.callAI(responsePrompt, { maxTokens: 500, temperature: 0.7 });
    
    return {
      ...finalResponse,
      metadata: {
        classification: classification.classification,
        confidence: classification.confidence,
        chainOfThought: true,
        contextSummary: understanding.text
      }
    };
  }
  
  /**
   * Call the appropriate AI provider
   */
  async callAI(prompt, options = {}) {
    if (!this.provider || !this.apiKey) {
      return { 
        success: false, 
        error: 'AI not configured. Please set up your API key in settings.'
      };
    }
    
    try {
      switch (this.provider) {
        case 'openai':
          return await this.callOpenAI(prompt, options);
        case 'anthropic':
          return await this.callClaude(prompt, options);
        case 'google':
          return await this.callGemini(prompt, options);
        default:
          return { success: false, error: 'Unknown provider: ' + this.provider };
      }
    } catch (e) {
      console.error('[AI] Call error:', e);
      return { success: false, error: e.message };
    }
  }
  
  async callOpenAI(prompt, options) {
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
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 500
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      text: data.choices[0].message.content,
      usage: data.usage
    };
  }
  
  async callClaude(prompt, options) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model || 'claude-3-haiku-20240307',
        max_tokens: options.maxTokens ?? 500,
        temperature: options.temperature ?? 0.7,
        system: prompt.system,
        messages: [
          { role: 'user', content: prompt.user }
        ]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      text: data.content[0].text,
      usage: data.usage
    };
  }
  
  async callGemini(prompt, options) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model || 'gemini-pro'}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `System: ${prompt.system}\n\nUser: ${prompt.user}` }
          ]
        }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 500
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      text: data.candidates[0].content.parts[0].text,
      usage: data.usageMetadata
    };
  }
  
  buildPersonaSystemPrompt() {
    if (this.personaPrompt) {
      return `You are drafting responses on behalf of the user. Adopt this persona:\n\n${this.personaPrompt}\n\nRespond naturally as if you are the user. Be concise but friendly.`;
    }
    
    return `You are a helpful AI assistant drafting email responses. Be professional, concise, and friendly. Match the tone of the incoming message.`;
  }
  
  buildPrompt(message, context = {}) {
    const systemPrompt = this.buildPersonaSystemPrompt();
    
    let userPrompt = '';
    
    if (context.classification) {
      userPrompt += `MESSAGE TYPE: ${context.classification.toUpperCase()}\n`;
      userPrompt += `REASONING: ${context.reasoning}\n\n`;
    }
    
    userPrompt += `INCOMING MESSAGE:\n"${message}"\n\n`;
    userPrompt += `Draft a response that matches the user's persona and communication style.`;
    
    return {
      system: systemPrompt,
      user: userPrompt
    };
  }
}

module.exports = { AIResponseGenerator };
