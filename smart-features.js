const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Smart Features Engine
 * Scheduling, conversation memory, and intelligent behaviors
 */

class SmartFeatures {
  constructor() {
    this.conversations = new Map();
    this.scheduledTasks = [];
    this.settings = this.loadSettings();
  }
  
  loadSettings() {
    try {
      const settingsPath = path.join(os.homedir(), '.openego_smart_settings.json');
      if (fs.existsSync(settingsPath)) {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (e) {}
    
    return {
      quietHours: { start: 22, end: 8 }, // 10pm to 8am
      maxResponsesPerHour: 10,
      importantContacts: [],
      autoReplyPatterns: [],
      learningEnabled: true
    };
  }
  
  saveSettings() {
    try {
      const settingsPath = path.join(os.homedir(), '.openego_smart_settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (e) {}
  }
  
  // Conversation Memory
  getConversationContext(contactId) {
    if (!this.conversations.has(contactId)) {
      this.conversations.set(contactId, {
        messages: [],
        lastInteraction: null,
        topics: [],
        tone: 'neutral'
      });
    }
    return this.conversations.get(contactId);
  }
  
  addToConversation(contactId, message, isOutgoing = false) {
    const conversation = this.getConversationContext(contactId);
    
    conversation.messages.push({
      content: message,
      isOutgoing,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 20 messages
    if (conversation.messages.length > 20) {
      conversation.messages = conversation.messages.slice(-20);
    }
    
    conversation.lastInteraction = new Date().toISOString();
    
    // Extract topics
    this.extractTopics(conversation, message);
    
    // Save to disk periodically
    this.saveConversations();
  }
  
  extractTopics(conversation, message) {
    const topicKeywords = {
      meeting: ['meeting', 'call', 'zoom', 'discuss'],
      deadline: ['deadline', 'due', 'tomorrow', 'urgent'],
      project: ['project', 'delivery', 'milestone'],
      personal: ['lunch', 'coffee', 'weekend', 'family']
    };
    
    const lowerMsg = message.toLowerCase();
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(kw => lowerMsg.includes(kw))) {
        if (!conversation.topics.includes(topic)) {
          conversation.topics.push(topic);
        }
      }
    });
  }
  
  saveConversations() {
    try {
      const convPath = path.join(os.homedir(), '.openego_conversations.json');
      const data = Object.fromEntries(this.conversations);
      fs.writeFileSync(convPath, JSON.stringify(data, null, 2));
    } catch (e) {}
  }
  
  loadConversations() {
    try {
      const convPath = path.join(os.homedir(), '.openego_conversations.json');
      if (fs.existsSync(convPath)) {
        const data = JSON.parse(fs.readFileSync(convPath, 'utf8'));
        this.conversations = new Map(Object.entries(data));
      }
    } catch (e) {}
  }
  
  // Quiet Hours Check
  isQuietHours() {
    const now = new Date();
    const hour = now.getHours();
    const { start, end } = this.settings.quietHours;
    
    if (start > end) {
      // Overnight quiet hours (e.g., 22:00 - 08:00)
      return hour >= start || hour < end;
    } else {
      // Same day quiet hours
      return hour >= start && hour < end;
    }
  }
  
  shouldSendMessage(contactId, isImportant = false) {
    // Always send if marked important
    if (isImportant) return { shouldSend: true, reason: 'important' };
    
    // Check quiet hours
    if (this.isQuietHours()) {
      return { 
        shouldSend: false, 
        reason: 'quiet_hours',
        suggestion: 'Schedule for morning'
      };
    }
    
    // Check rate limiting
    const recentSends = this.getRecentSendCount(1); // Last hour
    if (recentSends >= this.settings.maxResponsesPerHour) {
      return {
        shouldSend: false,
        reason: 'rate_limited',
        suggestion: 'Queue for later'
      };
    }
    
    return { shouldSend: true, reason: 'ok' };
  }
  
  getRecentSendCount(hours) {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    // Would count actual sends from logs
    return 0; // Placeholder
  }
  
  // Smart Scheduling
  suggestSendTime(contactId, urgency = 'normal') {
    const now = new Date();
    const contact = this.getConversationContext(contactId);
    
    // If we have history, check when they usually respond
    if (contact.messages.length > 0) {
      const responseTimes = this.analyzeResponseTimes(contact);
      if (responseTimes.preferredHour !== null) {
        const suggested = new Date();
        suggested.setHours(responseTimes.preferredHour, 0, 0, 0);
        if (suggested < now) {
          suggested.setDate(suggested.getDate() + 1);
        }
        return suggested;
      }
    }
    
    // Default: business hours
    const businessHours = new Date();
    businessHours.setHours(10, 0, 0, 0); // 10am
    if (businessHours < now || this.isWeekend()) {
      businessHours.setDate(businessHours.getDate() + (this.isWeekend() ? 2 : 1));
    }
    return businessHours;
  }
  
  analyzeResponseTimes(contact) {
    // Analyze when contact typically responds
    const outgoing = contact.messages.filter(m => m.isOutgoing);
    const incoming = contact.messages.filter(m => !m.isOutgoing);
    
    // Simple analysis - would be more sophisticated in production
    return { preferredHour: 10 }; // Default to 10am
  }
  
  isWeekend() {
    const day = new Date().getDay();
    return day === 0 || day === 6;
  }
  
  // Auto-reply detection
  shouldAutoReply(message, contactId) {
    const contact = this.getConversationContext(contactId);
    
    // Don't auto-reply if we've already replied recently
    const lastOutgoing = contact.messages.filter(m => m.isOutgoing).pop();
    if (lastOutgoing) {
      const lastTime = new Date(lastOutgoing.timestamp);
      const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
      if (hoursSince < 1) {
        return { shouldReply: false, reason: 'recently_replied' };
      }
    }
    
    // Check for auto-reply patterns (vacation, OOO)
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('out of office') || lowerMsg.includes('vacation')) {
      return { shouldReply: false, reason: 'auto_reply_detected' };
    }
    
    return { shouldReply: true, reason: 'ok' };
  }
  
  // Smart Suggestions
  getSmartSuggestions(contactId, message) {
    const suggestions = [];
    const contact = this.getConversationContext(contactId);
    
    // Suggest based on conversation history
    if (contact.topics.includes('meeting')) {
      suggestions.push('Suggest meeting time based on your calendar');
    }
    
    if (contact.topics.includes('deadline')) {
      suggestions.push('Mention upcoming deadline');
    }
    
    // Suggest follow-up if needed
    const lastMsg = contact.messages.filter(m => !m.isOutgoing).pop();
    if (lastMsg) {
      const daysSince = (Date.now() - new Date(lastMsg.timestamp)) / (1000 * 60 * 60 * 24);
      if (daysSince > 3) {
        suggestions.push('Reference the delay in response');
      }
    }
    
    return suggestions;
  }
}

// Setup IPC handlers
function setupSmartFeatures() {
  const smart = new SmartFeatures();
  smart.loadConversations();
  
  ipcMain.handle('get-conversation-context', async (event, contactId) => {
    return smart.getConversationContext(contactId);
  });
  
  ipcMain.handle('add-to-conversation', async (event, contactId, message, isOutgoing) => {
    smart.addToConversation(contactId, message, isOutgoing);
    return { success: true };
  });
  
  ipcMain.handle('should-send-message', async (event, contactId, isImportant) => {
    return smart.shouldSendMessage(contactId, isImportant);
  });
  
  ipcMain.handle('suggest-send-time', async (event, contactId, urgency) => {
    return smart.suggestSendTime(contactId, urgency);
  });
  
  ipcMain.handle('get-smart-suggestions', async (event, contactId, message) => {
    return smart.getSmartSuggestions(contactId, message);
  });
  
  ipcMain.handle('is-quiet-hours', async () => {
    return { isQuietHours: smart.isQuietHours(), hours: smart.settings.quietHours };
  });
  
  ipcMain.handle('update-smart-settings', async (event, newSettings) => {
    smart.settings = { ...smart.settings, ...newSettings };
    smart.saveSettings();
    return { success: true };
  });
}

module.exports = { setupSmartFeatures, SmartFeatures };
