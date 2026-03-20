const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Message Classifier - Categorizes messages as Simple or Complex
 * Simple: Basic questions, no context needed ("want lunch?")
 * Complex: References previous topics, needs context ("about the proposal from the 18th...")
 */

class MessageClassifier {
  constructor() {
    // Keywords that indicate complexity
    this.complexityIndicators = [
      // References to time
      /\b(on|from|since|after|before|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|last week|last month|the \d+(th|st|nd|rd)?)\b/i,
      /\b(the \d+(th|st|nd|rd)?)\b/i,
      /\b(previous|earlier|before|prior|last)\b/i,
      
      // References to documents/files
      /\b(proposal|contract|document|file|attachment|pdf|doc|spreadsheet|report)\b/i,
      
      // References to specific people
      /\b(you (said|mentioned|told|promised|agreed))\b/i,
      /\b(regarding|about|concerning|referring to)\b/i,
      
      // Action items with context
      /\b(follow up|follow-up|remind|as discussed|per our conversation)\b/i,
      
      // Questions requiring explanation
      /\b(explain|clarify|elaborate|expand on|detail)\b/i,
      
      // Comparisons or decisions
      /\b(compared to|versus|vs|instead of|rather than|alternative)\b/i,
      /\b(decide|decision|choose|select|option)\b/i,
      
      // Financial/business specifics
      /\b(quota|revenue|budget|cost|price|invoice|payment|amount of)\b/i,
      /\b(\$\d+|\d+ percent|\d+%)\b/i
    ];
    
    // Simple message patterns (greetings, basic questions)
    this.simplePatterns = [
      /^\s*(hi|hey|hello|yo|sup|what's up)/i,
      /\b(lunch|coffee|dinner|drinks|meet up)\s*\??\s*$/i,
      /\b(free|available)\s+(today|tomorrow|later|now)\s*\??/i,
      /^\s*(yes|no|maybe|sure|ok|okay|great|thanks|thank you)\s*\.?\s*$/i,
      /\b(see you|talk soon|catch up|let's meet)\b/i,
      /\b(how are you|how's it going|what are you up to)\b/i
    ];
    
    this.emailsCache = null;
  }

  /**
   * Classify a message as 'simple' or 'complex'
   * @param {string} message - The incoming message text
   * @param {string} sender - Who sent the message
   * @returns {Object} Classification result
   */
  classify(message, sender = '') {
    const text = message.toLowerCase();
    let complexityScore = 0;
    let matchedIndicators = [];
    
    // Check for complexity indicators
    this.complexityIndicators.forEach((pattern, index) => {
      if (pattern.test(text)) {
        complexityScore += 1;
        matchedIndicators.push(pattern.toString());
      }
    });
    
    // Check for simple patterns (reduce score)
    this.simplePatterns.forEach(pattern => {
      if (pattern.test(text)) {
        complexityScore -= 1.5;
      }
    });
    
    // Length factor (longer messages tend to be more complex)
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 30) {
      complexityScore += 1;
    }
    
    // Determine classification
    const isComplex = complexityScore > 0;
    const confidence = Math.min(Math.abs(complexityScore) / 3, 1);
    
    return {
      classification: isComplex ? 'complex' : 'simple',
      confidence: confidence,
      score: complexityScore,
      indicators: matchedIndicators.slice(0, 3), // Top 3 indicators
      wordCount: wordCount,
      reasoning: isComplex 
        ? 'Message references specific context, dates, documents, or requires explanation'
        : 'Simple question or statement without specific context requirements'
    };
  }

  /**
   * Load cached emails for context retrieval
   */
  loadEmailsCache() {
    if (this.emailsCache) return this.emailsCache;
    
    const cachePath = path.join(os.homedir(), '.openego_emails_cache.json');
    if (fs.existsSync(cachePath)) {
      try {
        this.emailsCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        return this.emailsCache;
      } catch (e) {
        console.error('[Classifier] Error loading emails cache:', e);
      }
    }
    return [];
  }

  /**
   * Search for relevant context from historical emails
   * @param {string} message - The incoming message
   * @param {string} sender - Who sent it
   * @param {number} maxResults - Max context items to return
   * @returns {Array} Relevant email threads/conversations
   */
  findRelevantContext(message, sender, maxResults = 5) {
    const emails = this.loadEmailsCache();
    if (!emails || emails.length === 0) {
      return [];
    }
    
    const messageWords = message.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !this.isStopWord(w));
    
    // Score each email for relevance
    const scoredEmails = emails.map(email => {
      let score = 0;
      const emailText = `${email.subject || ''} ${email.content || email.body || ''}`.toLowerCase();
      
      // Same sender bonus
      if (sender && email.sender && email.sender.includes(sender)) {
        score += 5;
      }
      
      // Keyword matches
      messageWords.forEach(word => {
        if (emailText.includes(word)) {
          score += 1;
        }
        // Bonus for exact phrase matches
        if (emailText.includes(message.toLowerCase().substring(0, 20))) {
          score += 3;
        }
      });
      
      // Topic-specific scoring
      if (message.toLowerCase().includes('proposal') && emailText.includes('proposal')) {
        score += 3;
      }
      if (message.toLowerCase().includes('contract') && emailText.includes('contract')) {
        score += 3;
      }
      if (message.toLowerCase().includes('quota') && emailText.includes('quota')) {
        score += 3;
      }
      
      return { email, score };
    });
    
    // Sort by score and return top results
    scoredEmails.sort((a, b) => b.score - a.score);
    
    return scoredEmails
      .filter(item => item.score > 2) // Minimum relevance threshold
      .slice(0, maxResults)
      .map(item => ({
        subject: item.email.subject,
        sender: item.email.sender,
        date: item.email.date,
        preview: (item.email.content || item.email.body || '').substring(0, 300),
        relevanceScore: item.score
      }));
  }

  /**
   * Extract key entities from message (dates, names, topics)
   */
  extractEntities(message) {
    const entities = {
      dates: [],
      people: [],
      topics: [],
      documents: []
    };
    
    // Extract dates
    const datePatterns = [
      /\b(on |from |by )?(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(st|nd|rd|th)?\b/gi,
      /\b(the )?\d{1,2}(st|nd|rd|th)\b/gi,
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
      /\b(yesterday|tomorrow|last week|next week)\b/gi
    ];
    
    datePatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        entities.dates.push(...matches);
      }
    });
    
    // Extract document references
    const docPatterns = [
      /\b(proposal|contract|document|report|file|attachment)\b/gi,
      /\b(pdf|doc|docx|xls|xlsx)\b/gi
    ];
    
    docPatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        entities.documents.push(...matches);
      }
    });
    
    // Extract topics (capitalized phrases)
    const topicMatches = message.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3}\b/g);
    if (topicMatches) {
      entities.topics = topicMatches.slice(0, 5);
    }
    
    return entities;
  }

  /**
   * Build context-aware prompt for complex messages
   */
  buildContextPrompt(message, sender, classification) {
    const relevantContext = this.findRelevantContext(message, sender);
    const entities = this.extractEntities(message);
    
    let prompt = `INCOMING MESSAGE CLASSIFICATION: ${classification.classification.toUpperCase()}\n\n`;
    prompt += `FROM: ${sender}\n`;
    prompt += `MESSAGE: "${message}"\n\n`;
    
    if (entities.dates.length > 0) {
      prompt += `REFERENCED DATES: ${entities.dates.join(', ')}\n`;
    }
    if (entities.documents.length > 0) {
      prompt += `REFERENCED DOCUMENTS: ${entities.documents.join(', ')}\n`;
    }
    if (entities.topics.length > 0) {
      prompt += `POSSIBLE TOPICS: ${entities.topics.join(', ')}\n`;
    }
    
    if (relevantContext.length > 0) {
      prompt += `\n--- RELEVANT PREVIOUS CONVERSATIONS ---\n`;
      relevantContext.forEach((ctx, idx) => {
        prompt += `\n[${idx + 1}] ${ctx.subject}\n`;
        prompt += `From: ${ctx.sender} | Date: ${ctx.date}\n`;
        prompt += `Preview: ${ctx.preview}\n`;
      });
      prompt += `\n--- END CONTEXT ---\n`;
    }
    
    prompt += `\nINSTRUCTIONS:\n`;
    
    if (classification.classification === 'complex') {
      prompt += `This message requires context from previous conversations. `;
      prompt += `First, understand what is being discussed by reviewing the context above. `;
      prompt += `Then, formulate a response that:\n`;
      prompt += `1. Acknowledges the specific context (dates, documents, previous agreements)\n`;
      prompt += `2. Provides a helpful answer based on the historical data\n`;
      prompt += `3. Uses the user's natural communication style\n`;
      prompt += `4. Asks for clarification if the context is insufficient\n`;
    } else {
      prompt += `This is a simple message that can be answered directly. `;
      prompt += `Provide a brief, friendly response in the user's natural style.\n`;
    }
    
    return prompt;
  }

  isStopWord(word) {
    const stopWords = new Set([
      'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
      'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
      'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing',
      'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
      'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
      'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
      'me', 'more', 'most', 'my', 'myself', 'nor', 'of', 'on', 'once', 'only',
      'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
      'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the',
      'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
      'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
      'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
      'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
    ]);
    return stopWords.has(word.toLowerCase());
  }
}

module.exports = { MessageClassifier };
