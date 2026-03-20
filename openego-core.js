const { ipcMain } = require('electron');
const { AIResponseGenerator } = require('./ai-response-generator');
const { PersonaEngine } = require('./persona-engine');
const { CommunicationScanner } = require('./communication-scanner');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Core OpenEgo Controller
 * Orchestrates email scanning, persona training, and AI response generation
 */

class OpenEgoCore {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.aiGenerator = new AIResponseGenerator();
    this.personaEngine = new PersonaEngine();
    this.scanner = new CommunicationScanner(mainWindow);
    this.isInitialized = false;
    
    this.setupIPC();
  }

  setupIPC() {
    // Initialize OpenEgo core
    ipcMain.handle('openego-init', async () => {
      try {
        this.isInitialized = true;
        return { success: true, message: 'OpenEgo core initialized' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    // Scan emails and build persona
    ipcMain.handle('openego-scan-and-train', async (event, options = {}) => {
      try {
        console.log('[OpenEgo] Starting scan and train...');
        
        // 1. Scan emails
        const scanResults = await this.scanner.scanMail();
        console.log(`[OpenEgo] Scanned ${scanResults.emails.length} emails`);
        
        if (scanResults.emails.length === 0) {
          return { 
            success: false, 
            error: 'No emails found. Make sure Apple Mail has emails and Full Disk Access is granted.' 
          };
        }

        // 2. Analyze emails with persona engine
        console.log('[OpenEgo] Analyzing communication patterns...');
        scanResults.emails.forEach(email => {
          this.personaEngine.analyzeEmail({
            content: email.content || email.body || email.preview || '',
            timestamp: new Date(email.date || Date.now())
          });
        });

        // 3. Generate persona profile
        const persona = this.personaEngine.generatePersonaProfile();
        console.log('[OpenEgo] Persona generated:', persona.name);

        // 4. Save persona
        this.personaEngine.savePersona();

        // 5. Calculate confidence
        const confidence = Math.min(scanResults.emails.length / 50 * 100, 100);

        return {
          success: true,
          emailsAnalyzed: scanResults.emails.length,
          confidence: confidence,
          persona: persona
        };
      } catch (e) {
        console.error('[OpenEgo] Scan and train error:', e);
        return { success: false, error: e.message };
      }
    });

    // Generate AI response
    ipcMain.handle('openego-generate-response', async (event, messageData) => {
      try {
        console.log('[OpenEgo] Generating response...', messageData);

        // Check if AI is configured
        const settingsPath = path.join(os.homedir(), '.openego_ai_settings.json');
        if (!fs.existsSync(settingsPath)) {
          return {
            success: false,
            error: 'AI not configured. Please set up your API key in Settings > AI Model.'
          };
        }

        // Generate response
        const result = await this.aiGenerator.generateResponse(messageData);
        
        if (result.success) {
          console.log('[OpenEgo] Response generated successfully');
          return {
            success: true,
            response: result.text,
            usage: result.usage
          };
        } else {
          return result;
        }
      } catch (e) {
        console.error('[OpenEgo] Generate response error:', e);
        return { success: false, error: e.message };
      }
    });

    // Send message via appropriate channel
    ipcMain.handle('openego-send-message', async (event, sendData) => {
      try {
        console.log('[OpenEgo] Sending message...', sendData);
        
        const { channel, recipient, message, originalMessageId } = sendData;
        
        switch (channel) {
          case 'email':
            return await this.sendEmail(recipient, message, originalMessageId);
          case 'telegram':
            return await this.sendTelegram(recipient, message);
          default:
            return { success: false, error: `Unknown channel: ${channel}` };
        }
      } catch (e) {
        console.error('[OpenEgo] Send message error:', e);
        return { success: false, error: e.message };
      }
    });

    // Get persona status
    ipcMain.handle('openego-get-persona', async () => {
      try {
        const personaPath = path.join(os.homedir(), '.openego_persona.json');
        if (!fs.existsSync(personaPath)) {
          return { success: false, error: 'No persona found. Please train first.' };
        }

        const personaData = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
        const emailsAnalyzed = personaData.totalEmails || 0;
        const confidence = Math.min(emailsAnalyzed / 50 * 100, 100);

        return {
          success: true,
          persona: personaData.persona,
          totalEmails: emailsAnalyzed,
          confidence: confidence
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    // Check if ready (has persona and AI configured)
    ipcMain.handle('openego-check-ready', async () => {
      try {
        const personaPath = path.join(os.homedir(), '.openego_persona.json');
        const aiSettingsPath = path.join(os.homedir(), '.openego_ai_settings.json');
        
        const hasPersona = fs.existsSync(personaPath);
        const hasAI = fs.existsSync(aiSettingsPath);
        
        let personaConfidence = 0;
        if (hasPersona) {
          const personaData = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
          personaConfidence = Math.min((personaData.totalEmails || 0) / 50 * 100, 100);
        }

        return {
          success: true,
          ready: hasPersona && hasAI && personaConfidence >= 80,
          hasPersona,
          hasAI,
          confidence: personaConfidence
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
  }

  async sendEmail(recipient, message, replyToId) {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      // AppleScript to send email via Mail app
      const script = `
        tell application "Mail"
          set newMessage to make new outgoing message with properties {subject:"Re: Your message", content:"${message.replace(/"/g, '\\"')}"}
          tell newMessage
            make new to recipient at end of to recipients with properties {address:"${recipient}"}
            send
          end tell
        end tell
      `;

      await execAsync(`osascript -e '${script}'`);
      return { success: true, message: 'Email sent successfully' };
    } catch (e) {
      console.error('[OpenEgo] Send email error:', e);
      return { success: false, error: e.message };
    }
  }

  async sendTelegram(chatId, message) {
    try {
      const tokenPath = path.join(os.homedir(), '.openego_telegram_token');
      if (!fs.existsSync(tokenPath)) {
        return { success: false, error: 'Telegram not configured' };
      }

      const token = fs.readFileSync(tokenPath, 'utf8').trim();
      
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        return { success: true, message: 'Message sent via Telegram' };
      } else {
        return { success: false, error: data.description };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

    // Save AI settings
    ipcMain.handle("save-ai-settings", async (event, settings) => {
      try {
        const settingsPath = path.join(os.homedir(), ".openego_ai_settings.json");
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        
        // Reload settings in generator
        this.aiGenerator.loadSettings();
        
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
module.exports = { OpenEgoCore };
