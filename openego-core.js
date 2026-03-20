const { ipcMain, clipboard } = require('electron');
const { AIResponseGenerator } = require('./ai-response-generator');
const { PersonaEngine } = require('./persona-engine');
const { CommunicationScanner } = require('./communication-scanner');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Core OpenEgo Controller
 * Orchestrates email scanning, persona training, and AI response generation
 * Handles Co-Pilot vs Auto-Pilot modes
 * Provides clipboard copy for unsupported platforms
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

    // Handle message response with Co-Pilot vs Auto-Pilot logic
    ipcMain.handle('openego-handle-response', async (event, data) => {
      try {
        console.log('[OpenEgo] Handling response...', data);
        
        const { message, response, channel, sender, mode } = data;
        
        // Define supported channels for auto-send
        const autoSendChannels = ['email', 'telegram'];
        const supportsAutoSend = autoSendChannels.includes(channel);
        
        // Co-Pilot Mode: Always show notification for approval
        if (mode === 'copilot') {
          console.log('[OpenEgo] Co-Pilot mode: Showing notification for approval');
          
          // Show in-app notification with copy/edit/send options
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('show-response-notification', {
              originalMessage: message,
              generatedResponse: response,
              sender: sender,
              channel: channel,
              mode: 'copilot',
              actions: supportsAutoSend ? ['copy', 'edit', 'send'] : ['copy', 'edit'],
              timestamp: new Date().toISOString()
            });
          }
          
          // Also copy to clipboard for convenience
          clipboard.writeText(response);
          
          return {
            success: true,
            mode: 'copilot',
            action: 'notification',
            message: 'Response generated and copied to clipboard. Review in notification.',
            supportsAutoSend: supportsAutoSend
          };
        }
        
        // Auto-Pilot Mode: Auto-send if supported, otherwise copy
        if (mode === 'autopilot') {
          if (!supportsAutoSend) {
            // Platform doesn't support auto-send (WhatsApp, etc.)
            console.log(`[OpenEgo] Auto-Pilot: ${channel} doesn't support auto-send, copying to clipboard`);
            clipboard.writeText(response);
            
            // Show notification
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('show-response-notification', {
                originalMessage: message,
                generatedResponse: response,
                sender: sender,
                channel: channel,
                mode: 'autopilot-copy',
                actions: ['copy'],
                note: `${channel} doesn't support auto-send. Response copied to clipboard.`,
                timestamp: new Date().toISOString()
              });
            }
            
            return {
              success: true,
              mode: 'autopilot',
              action: 'copy',
              message: `${channel} doesn't support auto-send. Response copied to clipboard.`,
              response: response
            };
          }
          
          // Auto-send for supported channels
          console.log(`[OpenEgo] Auto-Pilot: Auto-sending via ${channel}`);
          
          let sendResult;
          switch (channel) {
            case 'email':
              sendResult = await this.sendEmail(sender, response);
              break;
            case 'telegram':
              sendResult = await this.sendTelegram(sender, response);
              break;
            default:
              sendResult = { success: false, error: `Unknown channel: ${channel}` };
          }
          
          return {
            success: sendResult.success,
            mode: 'autopilot',
            action: 'auto-send',
            channel: channel,
            result: sendResult
          };
        }
        
        return { success: false, error: `Unknown mode: ${mode}` };
      } catch (e) {
        console.error('[OpenEgo] Handle response error:', e);
        return { success: false, error: e.message };
      }
    });

    // Copy to clipboard
    ipcMain.handle('openego-copy-to-clipboard', async (event, text) => {
      try {
        clipboard.writeText(text);
        console.log('[OpenEgo] Copied to clipboard');
        return { success: true, message: 'Response copied to clipboard' };
      } catch (e) {
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

    // Save AI settings
    ipcMain.handle('save-ai-settings', async (event, settings) => {
      try {
        const settingsPath = path.join(os.homedir(), '.openego_ai_settings.json');
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        
        // Reload settings in generator
        this.aiGenerator.loadSettings();
        
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    // Check Mail permissions
    ipcMain.handle('check-mail-permissions', async () => {
      try {
        if (process.platform !== 'darwin') {
          return { granted: false, error: 'Apple Mail only available on macOS' };
        }
        
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        // Try to read from Mail to check permissions
        const script = `
          tell application "Mail"
            return (count of accounts) > 0
          end tell
        `;
        
        try {
          await execAsync(`osascript -e '${script}'`, { timeout: 5000 });
          return { granted: true };
        } catch (e) {
          return { granted: false, error: 'Full Disk Access or Mail permissions required' };
        }
      } catch (e) {
        return { granted: false, error: e.message };
      }
    });

    // Check for updates
    ipcMain.handle('check-for-updates', async () => {
      try {
        // Check GitHub releases for latest version
        const response = await fetch('https://api.github.com/repos/carlv991/openego/releases/latest');
        if (!response.ok) {
          return { updateAvailable: false, error: 'Could not check for updates' };
        }
        
        const release = await response.json();
        const latestVersion = release.tag_name.replace('v', '');
        const currentVersion = '0.1.65'; // Current app version
        
        // Simple version comparison
        const latestParts = latestVersion.split('.').map(Number);
        const currentParts = currentVersion.split('.').map(Number);
        
        let updateAvailable = false;
        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
          const latest = latestParts[i] || 0;
          const current = currentParts[i] || 0;
          if (latest > current) {
            updateAvailable = true;
            break;
          } else if (latest < current) {
            break;
          }
        }
        
        return {
          updateAvailable,
          version: latestVersion,
          currentVersion,
          releaseNotes: release.body,
          downloadUrl: release.html_url
        };
      } catch (e) {
        return { updateAvailable: false, error: e.message };
      }
    });

    // Download update (open browser)
    ipcMain.handle('download-update', async () => {
      try {
        const { shell } = require('electron');
        const result = await ipcMain.invoke('check-for-updates');
        if (result.downloadUrl) {
          shell.openExternal(result.downloadUrl);
        }
        return { success: true };
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

module.exports = { OpenEgoCore };
