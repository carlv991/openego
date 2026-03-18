// Data Analysis - Extract communication patterns from user data

class CommunicationAnalyzer {
  constructor() {
    this.patterns = {
      greetings: [],
      closings: [],
      commonPhrases: [],
      responseLength: 'medium',
      formality: 'neutral',
      emojiUsage: false,
      signature: ''
    };
  }

  // Analyze emails and extract patterns
  analyzeEmails(emails) {
    if (!emails || emails.length === 0) return;

    // Extract greetings
    const greetingPatterns = [
      /^(Hi|Hey|Hello|Dear|Greetings)[,\s]/i,
      /^(Good morning|Good afternoon|Good evening)/i
    ];

    // Extract closings
    const closingPatterns = [
      /(Best|Regards|Thanks|Thank you|Cheers|Talk soon)[,\s]*$/i,
      /(Sincerely|Yours truly|Best wishes)/i
    ];

    emails.forEach(email => {
      const content = email.preview || '';
      
      // Check for greetings
      greetingPatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match && !this.patterns.greetings.includes(match[0])) {
          this.patterns.greetings.push(match[0].trim());
        }
      });

      // Check for closings
      closingPatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match && !this.patterns.closings.includes(match[0])) {
          this.patterns.closings.push(match[0].trim());
        }
      });

      // Check for emoji usage
      if (/[\u{1F600}-\u{1F64F}]/u.test(content)) {
        this.patterns.emojiUsage = true;
      }

      // Estimate formality
      const formalWords = /(Dear|Sincerely|Regards|Please|Thank you|Would you|Could you)/gi;
      const informalWords = /(Hey|Hi there|Cheers|Talk soon|Let me know|Sounds good)/gi;
      
      const formalCount = (content.match(formalWords) || []).length;
      const informalCount = (content.match(informalWords) || []).length;
      
      if (formalCount > informalCount) {
        this.patterns.formality = 'formal';
      } else if (informalCount > formalCount) {
        this.patterns.formality = 'informal';
      }
    });

    // Save patterns
    this.savePatterns();
  }

  // Analyze documents for writing style
  analyzeDocuments(documents) {
    if (!documents || documents.length === 0) return;

    // In a real implementation, we'd read document contents
    // For now, just track that we have documents
    console.log(`Analyzed ${documents.length} documents`);
  }

  // Get user profile for AI prompting
  getUserProfile() {
    const saved = localStorage.getItem('openego_patterns');
    if (saved) {
      this.patterns = JSON.parse(saved);
    }

    return {
      greeting: this.patterns.greetings[0] || 'Hi',
      closing: this.patterns.closings[0] || 'Best',
      formality: this.patterns.formality,
      usesEmoji: this.patterns.emojiUsage,
      style: this.generateStyleDescription()
    };
  }

  generateStyleDescription() {
    const parts = [];
    
    if (this.patterns.formality === 'formal') {
      parts.push('professional and formal');
    } else if (this.patterns.formality === 'informal') {
      parts.push('casual and friendly');
    } else {
      parts.push('balanced and neutral');
    }

    if (this.patterns.emojiUsage) {
      parts.push('uses emojis');
    }

    return parts.join(', ');
  }

  savePatterns() {
    localStorage.setItem('openego_patterns', JSON.stringify(this.patterns));
  }

  // Generate personalized prompt for AI
  generateAIPrompt(message) {
    const profile = this.getUserProfile();
    
    return `You are drafting a response for someone with this communication style:
- Tone: ${profile.style}
- Greeting: ${profile.greeting}
- Closing: ${profile.closing}
- ${profile.usesEmoji ? 'Uses emojis occasionally' : 'No emojis'}

Original message: "${message}"

Draft a response that matches this style. Keep it concise and natural.`;
  }
}

// Export for use in Electron
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommunicationAnalyzer;
}
