const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Training Engine
 * Creates realistic training scenarios from user's actual email history
 */

class TrainingEngine {
  constructor() {
    this.scenarios = [];
    this.userResponses = [];
    this.accuracy = 0;
  }
  
  async loadTrainingData() {
    try {
      // Load user's emails
      const emails = await this.loadUserEmails();
      
      // Load persona for context
      const personaPath = path.join(os.homedir(), '.openego_persona.json');
      let persona = null;
      if (fs.existsSync(personaPath)) {
        persona = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
      }
      
      // Generate scenarios from real emails
      this.scenarios = this.generateScenarios(emails, persona);
      
      console.log(`[Training] Loaded ${this.scenarios.length} training scenarios`);
      
      return this.scenarios;
    } catch (e) {
      console.error('[Training] Error loading data:', e);
      return [];
    }
  }
  
  async loadUserEmails() {
    const emails = [];
    const mailPath = path.join(os.homedir(), 'Library/Mail');
    
    try {
      if (!fs.existsSync(mailPath)) return emails;
      
      // Get recent emails (last 100)
      const files = [];
      this.collectEmailFiles(mailPath, files, 100);
      
      for (const filePath of files.slice(0, 50)) { // Limit to 50 for training
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const email = this.parseEmail(content);
          if (email && email.from && email.subject) {
            emails.push(email);
          }
        } catch (e) {}
      }
    } catch (e) {}
    
    return emails;
  }
  
  collectEmailFiles(dir, files, limit) {
    if (files.length >= limit) return;
    
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (files.length >= limit) break;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          this.collectEmailFiles(fullPath, files, limit);
        } else if (item.endsWith('.emlx') || item.endsWith('.eml')) {
          files.push(fullPath);
        }
      }
    } catch (e) {}
  }
  
  parseEmail(content) {
    try {
      const lines = content.split('\n');
      const email = { subject: '', from: '', content: '', thread: [] };
      
      let inContent = false;
      const contentLines = [];
      
      for (const line of lines) {
        if (line.startsWith('Subject:')) {
          email.subject = line.substring(8).trim();
        } else if (line.startsWith('From:')) {
          email.from = line.substring(5).trim();
          const match = email.from.match(/<([^>]+)>/);
          if (match) email.from = match[1];
        } else if (line === '' && !inContent) {
          inContent = true;
        } else if (inContent) {
          contentLines.push(line);
        }
      }
      
      email.content = contentLines.join('\n').trim();
      email.preview = email.content.substring(0, 300);
      
      return email;
    } catch (e) {
      return null;
    }
  }
  
  generateScenarios(emails, persona) {
    const scenarios = [];
    
    // Categorize emails by type
    const categories = {
      meeting: emails.filter(e => this.isMeetingEmail(e)),
      question: emails.filter(e => this.isQuestionEmail(e)),
      deadline: emails.filter(e => this.isDeadlineEmail(e)),
      followup: emails.filter(e => this.isFollowUpEmail(e)),
      introduction: emails.filter(e => this.isIntroductionEmail(e))
    };
    
    // Create scenarios from each category
    Object.entries(categories).forEach(([type, typeEmails]) => {
      typeEmails.slice(0, 3).forEach((email, index) => {
        scenarios.push({
          id: `${type}-${index}`,
          type: type,
          from: email.from,
          subject: email.subject,
          message: email.preview,
          fullContent: email.content,
          context: this.getScenarioContext(type, persona)
        });
      });
    });
    
    // Shuffle scenarios
    return scenarios.sort(() => Math.random() - 0.5).slice(0, 10);
  }
  
  isMeetingEmail(email) {
    const text = (email.subject + ' ' + email.content).toLowerCase();
    return text.includes('meeting') || text.includes('call') || text.includes('zoom') || text.includes('schedule');
  }
  
  isQuestionEmail(email) {
    return (email.content || '').includes('?');
  }
  
  isDeadlineEmail(email) {
    const text = (email.subject + ' ' + email.content).toLowerCase();
    return text.includes('deadline') || text.includes('due') || text.includes('urgent');
  }
  
  isFollowUpEmail(email) {
    const text = (email.subject + ' ' + email.content).toLowerCase();
    return text.includes('follow up') || text.includes('following up') || text.includes('checking in');
  }
  
  isIntroductionEmail(email) {
    const text = (email.subject + ' ' + email.content).toLowerCase();
    return text.includes('intro') || text.includes('meet') || text.includes('connect');
  }
  
  getScenarioContext(type, persona) {
    const contexts = {
      meeting: 'Someone wants to schedule a meeting with you',
      question: 'Someone is asking you a question',
      deadline: 'Someone is asking about a deadline',
      followup: 'Someone is following up on a previous conversation',
      introduction: 'Someone is introducing themselves or connecting you with someone'
    };
    return contexts[type] || 'General communication';
  }
  
  recordResponse(scenarioId, aiResponse, userFeedback) {
    // Store how the user edited the AI response
    this.userResponses.push({
      scenarioId,
      aiResponse,
      userFeedback,
      timestamp: new Date().toISOString()
    });
    
    // Save to disk
    this.saveTrainingData();
    
    // Update accuracy
    this.calculateAccuracy();
  }
  
  saveTrainingData() {
    try {
      const trainingPath = path.join(os.homedir(), '.openego_training_data.json');
      fs.writeFileSync(trainingPath, JSON.stringify({
        responses: this.userResponses,
        accuracy: this.accuracy,
        lastUpdated: new Date().toISOString()
      }));
    } catch (e) {
      console.error('[Training] Error saving:', e);
    }
  }
  
  loadTrainingProgress() {
    try {
      const trainingPath = path.join(os.homedir(), '.openego_training_data.json');
      if (fs.existsSync(trainingPath)) {
        const data = JSON.parse(fs.readFileSync(trainingPath, 'utf8'));
        this.userResponses = data.responses || [];
        this.accuracy = data.accuracy || 0;
        return data;
      }
    } catch (e) {}
    return null;
  }
  
  calculateAccuracy() {
    // Simple accuracy based on whether user made edits
    if (this.userResponses.length === 0) return 0;
    
    const exactMatches = this.userResponses.filter(r => 
      r.aiResponse.trim() === r.userFeedback.trim()
    ).length;
    
    this.accuracy = Math.round((exactMatches / this.userResponses.length) * 100);
    return this.accuracy;
  }
  
  async generateLearningReport() {
    const progress = this.loadTrainingProgress();
    
    return {
      totalScenarios: this.scenarios.length,
      completedScenarios: this.userResponses.length,
      accuracy: this.accuracy,
      insights: this.generateInsights()
    };
  }
  
  generateInsights() {
    const insights = [];
    
    if (this.accuracy >= 80) {
      insights.push('Your AI is highly accurate! Ready for Auto-Pilot mode.');
    } else if (this.accuracy >= 60) {
      insights.push('Good progress! Keep training to improve accuracy.');
    } else {
      insights.push('More training needed. The AI is still learning your style.');
    }
    
    // Analyze common edits
    const editedResponses = this.userResponses.filter(r => 
      r.aiResponse.trim() !== r.userFeedback.trim()
    );
    
    if (editedResponses.length > 0) {
      insights.push(`You've made edits to ${editedResponses.length} responses to match your style.`);
    }
    
    return insights;
  }
}

// Setup IPC handlers
function setupTrainingEngine() {
  const engine = new TrainingEngine();
  
  ipcMain.handle('load-training-scenarios', async () => {
    return engine.loadTrainingData();
  });
  
  ipcMain.handle('record-training-response', async (event, scenarioId, aiResponse, userFeedback) => {
    engine.recordResponse(scenarioId, aiResponse, userFeedback);
    return { success: true, accuracy: engine.accuracy };
  });
  
  ipcMain.handle('get-training-progress', async () => {
    return engine.generateLearningReport();
  });
  
  ipcMain.handle('unlock-autopilot', async () => {
    const report = await engine.generateLearningReport();
    if (report.accuracy >= 80) {
      return { unlocked: true, message: 'Auto-Pilot unlocked!' };
    } else {
      return { 
        unlocked: false, 
        message: `Need ${80 - report.accuracy}% more accuracy to unlock Auto-Pilot`,
        currentAccuracy: report.accuracy
      };
    }
  });
}

module.exports = { setupTrainingEngine, TrainingEngine };
