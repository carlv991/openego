const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Message Tracker - Prevents replies to historical messages
 * Tracks seen message IDs and only allows replies to new ones
 */

class MessageTracker {
  constructor() {
    this.trackingFile = path.join(os.homedir(), '.openego_seen_messages.json');
    this.seenMessages = this.loadSeenMessages();
    this.processedToday = new Set();
  }

  loadSeenMessages() {
    try {
      if (fs.existsSync(this.trackingFile)) {
        const data = JSON.parse(fs.readFileSync(this.trackingFile, 'utf8'));
        return new Set(data.messageIds || []);
      }
    } catch (e) {
      console.error('[Tracker] Error loading seen messages:', e);
    }
    return new Set();
  }

  saveSeenMessages() {
    try {
      const data = {
        messageIds: Array.from(this.seenMessages),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.trackingFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[Tracker] Error saving seen messages:', e);
    }
  }

  /**
   * Check if message is new (never seen before)
   * @param {string} messageId - Unique message identifier
   * @returns {boolean} true if new, false if already seen
   */
  isNewMessage(messageId) {
    // Skip if already in persistent storage
    if (this.seenMessages.has(messageId)) {
      console.log(`[Tracker] Message ${messageId} already seen (historical)`);
      return false;
    }
    
    // Skip if already processed today (session cache)
    if (this.processedToday.has(messageId)) {
      console.log(`[Tracker] Message ${messageId} already processed today`);
      return false;
    }
    
    return true;
  }

  /**
   * Mark message as seen
   * @param {string} messageId - Unique message identifier
   */
  markAsSeen(messageId) {
    this.seenMessages.add(messageId);
    this.processedToday.add(messageId);
    
    // Auto-save every 10 messages
    if (this.seenMessages.size % 10 === 0) {
      this.saveSeenMessages();
    }
  }

  /**
   * Generate unique message ID from email/message data
   */
  generateMessageId(source, sender, subject, timestamp) {
    const crypto = require('crypto');
    const data = `${source}:${sender}:${subject}:${timestamp}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Get stats about tracked messages
   */
  getStats() {
    return {
      totalSeen: this.seenMessages.size,
      processedToday: this.processedToday.size,
      lastUpdated: fs.existsSync(this.trackingFile) 
        ? fs.statSync(this.trackingFile).mtime 
        : null
    };
  }

  /**
   * Clear all tracked messages (use with caution!)
   */
  clearAll() {
    this.seenMessages.clear();
    this.processedToday.clear();
    this.saveSeenMessages();
    console.log('[Tracker] All tracked messages cleared');
  }

  /**
   * Clean up old messages (keep last 30 days)
   */
  cleanup() {
    // This would require storing timestamps with each message
    // For now, we'll just save the current state
    this.saveSeenMessages();
  }
}

module.exports = { MessageTracker };
