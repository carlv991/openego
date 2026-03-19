const { ipcMain, dialog, systemPreferences } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Full Disk Access check and request
function setupFullDiskAccessHandlers() {
  ipcMain.handle('check-full-disk-access', async () => {
    if (process.platform !== 'darwin') {
      return { granted: true, platform: process.platform };
    }
    
    // On macOS, check multiple protected locations
    const testPaths = [
      path.join(os.homedir(), 'Library/Mail'),
      path.join(os.homedir(), 'Library/Messages'),
      path.join(os.homedir(), 'Library/Containers/com.apple.mail'),
      path.join(os.homedir(), 'Library/Application Scripts/com.apple.mail')
    ];
    
    // Try to read a protected directory
    let accessGranted = false;
    let testedPaths = [];
    
    for (const testPath of testPaths) {
      try {
        if (fs.existsSync(testPath)) {
          const files = fs.readdirSync(testPath);
          testedPaths.push({ path: testPath, accessible: true, files: files.length });
          accessGranted = true;
        } else {
          testedPaths.push({ path: testPath, exists: false });
        }
      } catch (e) {
        testedPaths.push({ path: testPath, accessible: false, error: e.code });
      }
    }
    
    // Also check if we can access the TCC database (meta check)
    let tccAccessible = false;
    try {
      const tccPath = path.join(os.homedir(), 'Library/Application Support/com.apple.TCC/TCC.db');
      fs.accessSync(tccPath, fs.constants.R_OK);
      tccAccessible = true;
    } catch (e) {
      // TCC not accessible, which is expected without FDA
    }
    
    console.log('[FDA Check] Results:', { accessGranted, tccAccessible, testedPaths });
    
    return { 
      granted: accessGranted, 
      tccAccessible,
      debug: testedPaths 
    };
  });
  
  // Check if OpenEgo is already in the Full Disk Access list (even if not checked)
  ipcMain.handle('check-openego-in-list', async () => {
    if (process.platform !== 'darwin') {
      return { inList: false, platform: process.platform };
    }
    
    try {
      // Read the TCC database (requires Full Disk Access itself, so this may fail)
      const tccPath = path.join(os.homedir(), 'Library/Application Support/com.apple.TCC/TCC.db');
      
      // Try to check if we can at least see if OpenEgo is in the database
      // This is a simplified check - in reality, we'd need SQLite access
      return { 
        inList: false, 
        note: 'Cannot check without Full Disk Access. If you previously added OpenEgo, just check the box next to it.'
      };
    } catch (e) {
      return { inList: false, error: e.message };
    }
  });
  
  ipcMain.handle('request-full-disk-access', async () => {
    if (process.platform !== 'darwin') {
      return { granted: true };
    }
    
    // Open System Preferences to Full Disk Access
    const { shell } = require('electron');
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
    
    // Show instructions dialog
    dialog.showMessageBox({
      type: 'info',
      title: 'Grant Full Disk Access',
      message: 'Please grant Full Disk Access to OpenEgo',
      detail: '1. Click the lock icon to make changes\n2. Click the + button\n3. Select OpenEgo from Applications\n4. Check the box next to OpenEgo\n5. Restart OpenEgo',
      buttons: ['Done', 'Cancel'],
      defaultId: 0
    });
    
    return { requested: true };
  });
}

// Scan Mail app data - ALL emails with progress and resume capability
async function scanAllMailData(window) {
  const mailPath = path.join(os.homedir(), 'Library/Mail');
  const progressFile = path.join(os.homedir(), '.openego_scan_progress.json');
  
  // Load previous progress if exists
  let progress = { processedFiles: [], emails: [], lastIndex: 0 };
  try {
    if (fs.existsSync(progressFile)) {
      progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      console.log(`Resuming scan from ${progress.lastIndex}`);
    }
  } catch (e) {
    console.log('No previous progress found');
  }
  
  const emails = progress.emails || [];
  const processedFiles = new Set(progress.processedFiles || []);
  let processedCount = emails.length;
  
  try {
    if (!fs.existsSync(mailPath)) {
      return { error: 'Mail folder not found', emails: emails };
    }
    
    // Get all email files
    const allFiles = [];
    function collectFiles(dir) {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              collectFiles(fullPath);
            } else if (item.endsWith('.emlx') || item.endsWith('.eml')) {
              allFiles.push(fullPath);
            }
          } catch (e) {
            // Skip files we can't stat
          }
        }
      } catch (e) {
        console.log(`Cannot read directory: ${dir}`);
      }
    }
    
    collectFiles(mailPath);
    const totalFiles = allFiles.length;
    
    // Resume from where we left off
    const startIndex = progress.lastIndex || 0;
    console.log(`Scanning ${startIndex} to ${totalFiles}`);
    
    // Process in batches with error recovery
    for (let i = startIndex; i < allFiles.length; i++) {
      const filePath = allFiles[i];
      
      // Skip already processed files
      if (processedFiles.has(filePath)) {
        continue;
      }
      
      try {
        // Try to read with timeout protection
        const content = await Promise.race([
          fs.promises.readFile(filePath, 'utf8'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
        
        const from = content.match(/From: (.+)/i)?.[1] || 'Unknown';
        const subject = content.match(/Subject: (.+)/i)?.[1] || 'No Subject';
        const date = content.match(/Date: (.+)/i)?.[1] || '';
        const to = content.match(/To: (.+)/i)?.[1] || '';
        
        emails.push({
          from,
          to,
          subject,
          date,
          preview: content.substring(0, 1000),
          path: filePath
        });
        
        processedFiles.add(filePath);
        processedCount++;
        
        // Save progress every 25 files
        if (processedCount % 25 === 0) {
          fs.writeFileSync(progressFile, JSON.stringify({
            processedFiles: Array.from(processedFiles),
            emails: emails.slice(-100), // Keep last 100 in memory
            lastIndex: i,
            totalFiles: totalFiles,
            timestamp: new Date().toISOString()
          }));
        }
        
        // Send progress update every 50 files
        if (processedCount % 50 === 0 && window && !window.isDestroyed()) {
          try {
            window.webContents.send('scan-progress', {
              type: 'mail',
              processed: processedCount,
              total: totalFiles,
              percent: Math.round((processedCount / totalFiles) * 100),
              resuming: i > startIndex
            });
          } catch (e) {
            console.log('Window closed, continuing in background');
          }
        }
        
        // Small delay to prevent UI freezing
        if (processedCount % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (e) {
        console.log(`Error processing ${filePath}: ${e.message}`);
        // Continue with next file - don't crash
        processedFiles.add(filePath); // Mark as processed to skip next time
      }
    }
    
    // Clear progress file on completion
    try {
      fs.unlinkSync(progressFile);
    } catch (e) {
      // Ignore
    }
    
    return {
      count: emails.length,
      emails: emails,
      complete: true,
      resumed: startIndex > 0
    };
  } catch (e) {
    // Save progress on error so we can resume
    try {
      fs.writeFileSync(progressFile, JSON.stringify({
        processedFiles: Array.from(processedFiles),
        emails: emails.slice(-100),
        lastIndex: progress.lastIndex,
        totalFiles: allFiles.length,
        timestamp: new Date().toISOString(),
        error: e.message
      }));
    } catch (saveError) {
      console.log('Could not save progress:', saveError);
    }
    
    return { 
      error: e.message, 
      emails: emails,
      partial: true,
      canResume: true
    };
  }
}

// Legacy function for quick scan
function scanMailData() {
  const mailPath = path.join(os.homedir(), 'Library/Mail');
  const emails = [];
  
  try {
    if (!fs.existsSync(mailPath)) {
      return { error: 'Mail folder not found' };
    }
    
    // Quick scan - first 100 only
    function scanDirectory(dir) {
      if (emails.length >= 100) return;
      
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (emails.length >= 100) return;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.endsWith('.emlx') || item.endsWith('.eml')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const from = content.match(/From: (.+)/)?.[1] || 'Unknown';
            const subject = content.match(/Subject: (.+)/)?.[1] || 'No Subject';
            const date = content.match(/Date: (.+)/)?.[1] || '';
            
            emails.push({
              from,
              subject,
              date,
              preview: content.substring(0, 500)
            });
          } catch (e) {
            // Skip files we can't read
          }
        }
      }
    }
    
    scanDirectory(mailPath);
    
    return {
      count: emails.length,
      emails: emails
    };
  } catch (e) {
    return { error: e.message };
  }
}

// Scan Messages app
function scanMessagesData() {
  const messagesPath = path.join(os.homedir(), 'Library/Messages');
  const messages = [];
  
  try {
    if (!fs.existsSync(messagesPath)) {
      return { error: 'Messages folder not found' };
    }
    
    // Note: Actual Messages database is encrypted/complex
    // This is a simplified version
    const chatPath = path.join(messagesPath, 'chat.db');
    
    if (fs.existsSync(chatPath)) {
      // In real implementation, we'd use sqlite3 to read the database
      return {
        found: true,
        path: chatPath,
        note: 'Messages database found - requires parsing'
      };
    }
    
    return { error: 'Messages database not accessible' };
  } catch (e) {
    return { error: e.message };
  }
}

// Scan Documents folder
function scanDocuments() {
  const docsPath = path.join(os.homedir(), 'Documents');
  const documents = [];
  
  try {
    if (!fs.existsSync(docsPath)) {
      return { error: 'Documents folder not found' };
    }
    
    function scanDirectory(dir, depth = 0) {
      if (depth > 2) return; // Limit depth
      
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (item.startsWith('.')) continue; // Skip hidden
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath, depth + 1);
        } else if (
          item.endsWith('.txt') ||
          item.endsWith('.md') ||
          item.endsWith('.docx') ||
          item.endsWith('.pdf')
        ) {
          documents.push({
            name: item,
            path: fullPath,
            size: stat.size,
            modified: stat.mtime
          });
        }
      }
    }
    
    scanDirectory(docsPath);
    
    return {
      count: documents.length,
      documents: documents.slice(0, 50) // Limit
    };
  } catch (e) {
    return { error: e.message };
  }
}

// IPC handlers for scanning
function setupScanningHandlers(mainWindow) {
  // Quick scan for initial check
  ipcMain.handle('scan-mail', async () => {
    return scanMailData();
  });
  
  // Full background scan with progress
  ipcMain.handle('scan-all-mail', async () => {
    return scanAllMailData(mainWindow);
  });
  
  ipcMain.handle('scan-messages', async () => {
    return scanMessagesData();
  });
  
  ipcMain.handle('scan-documents', async () => {
    return scanDocuments();
  });
  
  ipcMain.handle('get-home-directory', async () => {
    return os.homedir();
  });
  
  // Get emails for training test
  ipcMain.handle('get-emails-for-training', async () => {
    try {
      // Try to load from the database or scan results
      const scanResultsPath = path.join(os.homedir(), '.openego_scan_results.json');
      
      if (fs.existsSync(scanResultsPath)) {
        const data = JSON.parse(fs.readFileSync(scanResultsPath, 'utf8'));
        if (data.emails && data.emails.length > 0) {
          // Return random sample of 5 emails
          const shuffled = data.emails.sort(() => 0.5 - Math.random());
          return { emails: shuffled.slice(0, 5) };
        }
      }
      
      // Try to scan Mail folder directly for a quick sample
      const mailPath = path.join(os.homedir(), 'Library/Mail');
      if (fs.existsSync(mailPath)) {
        // Quick scan for training - just get a few recent emails
        // This is a simplified version - in production you'd parse .eml files
        return { emails: [], message: 'Quick scan not implemented yet' };
      }
      
      return { emails: [], message: 'No emails found' };
    } catch (e) {
      console.error('Error getting emails for training:', e);
      return { emails: [], error: e.message };
    }
  });
}

// Local AI via Ollama
async function queryLocalAI(prompt, model = 'llama3.1') {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false
      })
    });
    
    const data = await response.json();
    return data.response;
  } catch (e) {
    return { error: 'Ollama not running', message: e.message };
  }
}

function setupLocalAIHandlers() {
  ipcMain.handle('query-local-ai', async (event, prompt, model) => {
    return queryLocalAI(prompt, model);
  });
  
  ipcMain.handle('check-ollama', async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      const data = await response.json();
      return { running: true, models: data.models || [] };
    } catch (e) {
      return { running: false };
    }
  });
}

// Feedback Loop - Learn from user edits
function setupFeedbackHandlers() {
  const { PersonaEngine } = require('./persona-engine');
  
  // Submit feedback when user edits a response
  ipcMain.handle('submit-feedback', async (event, editData) => {
    try {
      // Store the edit
      const feedbackPath = path.join(os.homedir(), '.openego_feedback.json');
      let feedback = [];
      
      if (fs.existsSync(feedbackPath)) {
        feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
      }
      
      feedback.push({
        ...editData,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 100 edits
      if (feedback.length > 100) {
        feedback = feedback.slice(-100);
      }
      
      fs.writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2));
      
      // Analyze the edit for patterns
      const engine = new PersonaEngine();
      engine.analyzeEmail({
        content: editData.edited,
        timestamp: new Date()
      });
      
      // Update persona with new patterns
      engine.savePersona();
      
      return { success: true, message: 'Feedback recorded' };
    } catch (e) {
      console.error('[Feedback] Error:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Get accumulated feedback
  ipcMain.handle('get-feedback', async () => {
    try {
      const feedbackPath = path.join(os.homedir(), '.openego_feedback.json');
      if (fs.existsSync(feedbackPath)) {
        return JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
      }
      return [];
    } catch (e) {
      return { error: e.message };
    }
  });
  
  // Get persona confidence
  ipcMain.handle('get-persona-confidence', async () => {
    try {
      const { PersonaEngine } = require('./persona-engine');
      const engine = new PersonaEngine();
      const personaData = engine.loadPersona();
      
      if (!personaData || !personaData.raw) {
        return { score: 0, label: 'No Data', description: 'Start using OpenEgo to build your persona' };
      }
      
      // Load the raw data into the engine
      engine.persona = {
        ...personaData.raw.persona,
        vocabulary: {
          ...personaData.raw.persona.vocabulary,
          uniqueWords: new Set(personaData.raw.persona.vocabulary?.uniqueWords || [])
        }
      };
      
      return engine.getConfidenceInfo();
    } catch (e) {
      console.error('[Confidence] Error:', e);
      return { error: e.message };
    }
  });
}

// AI Training - Send patterns to GPT-4/Claude
function setupAITrainingHandlers() {
  console.log('[AI Training] Setting up handlers...');
  
  const { PersonaEngine } = require('./persona-engine');
  console.log('[AI Training] PersonaEngine loaded');
  
  // Train AI on user's persona
  ipcMain.handle('train-ai-persona', async (event, apiKey, provider) => {
    try {
      // Load existing persona
      const engine = new PersonaEngine();
      const personaData = engine.loadPersona();
      
      if (!personaData) {
        return { error: 'No persona data found. Scan emails first.' };
      }
      
      // Generate training prompt
      const profile = personaData.persona;
      const trainingPrompt = profile.aiPrompt;
      
      // Store the training prompt for use in response generation
      const trainingPath = path.join(os.homedir(), '.openego_ai_training.json');
      fs.writeFileSync(trainingPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        provider: provider,
        prompt: trainingPrompt,
        profile: profile
      }, null, 2));
      
      return { 
        success: true, 
        message: 'AI training profile created',
        promptLength: trainingPrompt.length
      };
    } catch (e) {
      console.error('[AI Training] Error:', e);
      return { success: false, error: e.message };
    }
  });
  
  // Get AI training data
  ipcMain.handle('get-ai-training', async () => {
    try {
      const trainingPath = path.join(os.homedir(), '.openego_ai_training.json');
      if (fs.existsSync(trainingPath)) {
        return JSON.parse(fs.readFileSync(trainingPath, 'utf8'));
      }
      return null;
    } catch (e) {
      return { error: e.message };
    }
  });
  
  // Retrain persona from emails
  ipcMain.handle('retrain-persona', async () => {
    try {
      const { CommunicationScanner } = require('./communication-scanner');
      const scanner = new CommunicationScanner();
      
      // Scan emails with persona extraction
      const results = await scanner.scanMail();
      
      // Build persona from scanned emails
      const engine = new PersonaEngine();
      results.emails.forEach(email => {
        engine.analyzeEmail({
          content: email.body || email.preview || '',
          timestamp: new Date(email.date)
        });
      });
      
      // Save updated persona
      engine.savePersona();
      
      return { 
        success: true, 
        emailsAnalyzed: results.emails.length,
        persona: engine.generatePersonaProfile()
      };
    } catch (e) {
      console.error('[Retrain] Error:', e);
      return { success: false, error: e.message };
    }
  });
  
  console.log('[AI Training] All handlers registered');
}

module.exports = {
  setupFullDiskAccessHandlers,
  setupScanningHandlers,
  setupLocalAIHandlers,
  setupFeedbackHandlers,
  setupAITrainingHandlers,
  scanMailData,
  scanMessagesData,
  scanDocuments,
  scanAllMailData
};
