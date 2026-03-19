const { ipcMain } = require('electron');

/**
 * Multi-Channel Sender
 * Slack, WhatsApp Business, Microsoft Teams integrations
 */

class MultiChannelSender {
  constructor() {
    this.tokens = {};
    this.loadTokens();
  }
  
  loadTokens() {
    // Tokens would be loaded from secure storage
    // For now, this is a placeholder
  }
  
  // Slack Integration
  async sendSlackMessage(channel, text, options = {}) {
    const token = this.tokens.slack;
    if (!token) {
      return { success: false, error: 'Slack not configured' };
    }
    
    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: channel,
          text: text,
          thread_ts: options.threadTs || undefined,
          unfurl_links: false
        })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        return {
          success: true,
          messageId: data.ts,
          channel: data.channel
        };
      } else {
        throw new Error(data.error);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  async getSlackChannels() {
    const token = this.tokens.slack;
    if (!token) return { success: false, error: 'Not configured' };
    
    try {
      const response = await fetch('https://slack.com/api/conversations.list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (data.ok) {
        return {
          success: true,
          channels: data.channels.map(c => ({
            id: c.id,
            name: c.name,
            isPrivate: c.is_private
          }))
        };
      } else {
        throw new Error(data.error);
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  // WhatsApp Business API
  async sendWhatsAppMessage(phoneNumber, text) {
    // WhatsApp Business API requires Meta Business verification
    // This is a placeholder for the integration
    
    const config = this.tokens.whatsapp;
    if (!config) {
      return { 
        success: false, 
        error: 'WhatsApp Business not configured',
        setupInstructions: 'Requires Meta Business verification and WhatsApp Business API setup'
      };
    }
    
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'text',
          text: { body: text }
        })
      });
      
      const data = await response.json();
      
      if (data.messages) {
        return {
          success: true,
          messageId: data.messages[0].id
        };
      } else {
        throw new Error(data.error?.message || 'Unknown error');
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  // Microsoft Teams
  async sendTeamsMessage(chatId, text) {
    const token = this.tokens.teams;
    if (!token) {
      return { success: false, error: 'Teams not configured' };
    }
    
    try {
      const response = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body: {
            contentType: 'text',
            content: text
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          messageId: data.id
        };
      } else {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to send');
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  async getTeamsChats() {
    const token = this.tokens.teams;
    if (!token) return { success: false, error: 'Not configured' };
    
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/chats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          chats: data.value.map(c => ({
            id: c.id,
            topic: c.topic || 'Untitled',
            lastUpdated: c.lastUpdatedDateTime
          }))
        };
      } else {
        throw new Error('Failed to fetch chats');
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  // Channel availability check
  async checkChannelStatus(channel) {
    const statuses = {};
    
    if (channel === 'slack' || channel === 'all') {
      statuses.slack = !!this.tokens.slack;
    }
    
    if (channel === 'whatsapp' || channel === 'all') {
      statuses.whatsapp = !!this.tokens.whatsapp;
    }
    
    if (channel === 'teams' || channel === 'all') {
      statuses.teams = !!this.tokens.teams;
    }
    
    return statuses;
  }
}

// Setup IPC handlers
function setupMultiChannelHandlers() {
  const sender = new MultiChannelSender();
  
  ipcMain.handle('send-slack-message', async (event, channel, text, options) => {
    return sender.sendSlackMessage(channel, text, options);
  });
  
  ipcMain.handle('get-slack-channels', async () => {
    return sender.getSlackChannels();
  });
  
  ipcMain.handle('send-whatsapp-message', async (event, phoneNumber, text) => {
    return sender.sendWhatsAppMessage(phoneNumber, text);
  });
  
  ipcMain.handle('send-teams-message', async (event, chatId, text) => {
    return sender.sendTeamsMessage(chatId, text);
  });
  
  ipcMain.handle('get-teams-chats', async () => {
    return sender.getTeamsChats();
  });
  
  ipcMain.handle('check-channel-status', async (event, channel) => {
    return sender.checkChannelStatus(channel);
  });
}

module.exports = { setupMultiChannelHandlers, MultiChannelSender };
