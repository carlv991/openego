const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Error Recovery & Performance Monitor
 * Handles crashes, retries, and performance optimization
 */

class ErrorRecovery {
  constructor() {
    this.errorLog = [];
    this.retryQueue = [];
    this.performanceMetrics = {
      startTime: Date.now(),
      messagesProcessed: 0,
      errors: 0,
      avgResponseTime: 0
    };
    this.loadErrorLog();
  }
  
  // Error Logging
  logError(error, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context,
      recovered: false
    };
    
    this.errorLog.push(errorEntry);
    this.performanceMetrics.errors++;
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }
    
    this.saveErrorLog();
    
    console.error('[ErrorRecovery]', error.message, context);
  }
  
  saveErrorLog() {
    try {
      const logPath = path.join(os.homedir(), '.openego_error_log.json');
      fs.writeFileSync(logPath, JSON.stringify({
        errors: this.errorLog,
        metrics: this.performanceMetrics,
        lastSaved: new Date().toISOString()
      }));
    } catch (e) {}
  }
  
  loadErrorLog() {
    try {
      const logPath = path.join(os.homedir(), '.openego_error_log.json');
      if (fs.existsSync(logPath)) {
        const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        this.errorLog = data.errors || [];
        this.performanceMetrics = { ...this.performanceMetrics, ...data.metrics };
      }
    } catch (e) {}
  }
  
  // Retry Logic
  async withRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      backoffMultiplier = 2,
      onRetry = null
    } = options;
    
    let lastError;
    let delay = retryDelay;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        
        // Track performance
        const duration = Date.now() - startTime;
        this.trackPerformance(duration);
        
        return { success: true, result, attempts: attempt + 1 };
      } catch (error) {
        lastError = error;
        
        // Log the error
        this.logError(error, { attempt: attempt + 1, maxRetries });
        
        // Don't retry if it's a fatal error
        if (this.isFatalError(error)) {
          break;
        }
        
        // Call retry callback
        if (onRetry) {
          onRetry(attempt + 1, maxRetries, error);
        }
        
        // Wait before retrying
        if (attempt < maxRetries - 1) {
          await this.sleep(delay);
          delay *= backoffMultiplier;
        }
      }
    }
    
    return {
      success: false,
      error: lastError,
      attempts: maxRetries
    };
  }
  
  isFatalError(error) {
    // Don't retry authentication errors
    if (error.message?.includes('401') || error.message?.includes('403')) {
      return true;
    }
    
    // Don't retry if file not found
    if (error.code === 'ENOENT') {
      return true;
    }
    
    return false;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Performance Tracking
  trackPerformance(duration) {
    const { messagesProcessed, avgResponseTime } = this.performanceMetrics;
    
    // Update running average
    this.performanceMetrics.avgResponseTime = 
      (avgResponseTime * messagesProcessed + duration) / (messagesProcessed + 1);
    
    this.performanceMetrics.messagesProcessed++;
  }
  
  getPerformanceReport() {
    const uptime = Date.now() - this.performanceMetrics.startTime;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    
    return {
      uptime: `${hours} hours`,
      messagesProcessed: this.performanceMetrics.messagesProcessed,
      errors: this.performanceMetrics.errors,
      errorRate: this.performanceMetrics.messagesProcessed > 0
        ? ((this.performanceMetrics.errors / this.performanceMetrics.messagesProcessed) * 100).toFixed(2) + '%'
        : '0%',
      avgResponseTime: Math.round(this.performanceMetrics.avgResponseTime) + 'ms',
      recentErrors: this.errorLog.slice(-5)
    };
  }
  
  // Recovery Actions
  async recoverFromCrash() {
    console.log('[ErrorRecovery] Attempting crash recovery...');
    
    const recoverySteps = [];
    
    // Step 1: Check if we have partial scan data
    try {
      const progressPath = path.join(os.homedir(), '.openego_scan_progress.json');
      if (fs.existsSync(progressPath)) {
        const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
        recoverySteps.push({
          type: 'scan_resume',
          message: `Found incomplete scan with ${progress.emails?.length || 0} emails`,
          canResume: true
        });
      }
    } catch (e) {}
    
    // Step 2: Check for unsent messages
    try {
      const unsentPath = path.join(os.homedir(), '.openego_unsent_messages.json');
      if (fs.existsSync(unsentPath)) {
        const unsent = JSON.parse(fs.readFileSync(unsentPath, 'utf8'));
        recoverySteps.push({
          type: 'unsent_messages',
          message: `${unsent.length} messages in outbox`,
          canRetry: true
        });
      }
    } catch (e) {}
    
    // Step 3: Clear temporary files
    try {
      const tempDir = path.join(os.homedir(), '.openego_temp');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
        recoverySteps.push({
          type: 'cleanup',
          message: 'Cleared temporary files',
          success: true
        });
      }
    } catch (e) {}
    
    return {
      recovered: recoverySteps.length > 0,
      steps: recoverySteps,
      timestamp: new Date().toISOString()
    };
  }
  
  // Health Check
  async healthCheck() {
    const checks = {
      diskAccess: false,
      aiConfigured: false,
      permissions: {}
    };
    
    // Check disk access
    try {
      const testPath = path.join(os.homedir(), 'Library/Mail');
      fs.accessSync(testPath, fs.constants.R_OK);
      checks.diskAccess = true;
    } catch (e) {}
    
    // Check AI configuration
    try {
      const settingsPath = path.join(os.homedir(), '.openego_ai_settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        checks.aiConfigured = !!(settings.provider && settings.apiKey);
      }
    } catch (e) {}
    
    // Overall health
    const healthy = checks.diskAccess && checks.aiConfigured;
    
    return {
      healthy,
      checks,
      recommendations: this.getHealthRecommendations(checks)
    };
  }
  
  getHealthRecommendations(checks) {
    const recommendations = [];
    
    if (!checks.diskAccess) {
      recommendations.push('Grant Full Disk Access in System Preferences');
    }
    
    if (!checks.aiConfigured) {
      recommendations.push('Configure AI model in Settings');
    }
    
    return recommendations;
  }
  
  // Cleanup old data
  async cleanupOldData(maxAgeDays = 30) {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    try {
      // Clean old error logs
      this.errorLog = this.errorLog.filter(e => {
        const entryDate = new Date(e.timestamp).getTime();
        if (entryDate < cutoff) {
          cleaned++;
          return false;
        }
        return true;
      });
      
      this.saveErrorLog();
      
      return { success: true, cleaned };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// Setup IPC handlers
function setupErrorRecoveryHandlers() {
  const recovery = new ErrorRecovery();
  
  ipcMain.handle('get-performance-report', async () => {
    return recovery.getPerformanceReport();
  });
  
  ipcMain.handle('recover-from-crash', async () => {
    return recovery.recoverFromCrash();
  });
  
  ipcMain.handle('health-check', async () => {
    return recovery.healthCheck();
  });
  
  ipcMain.handle('cleanup-old-data', async (event, maxAgeDays) => {
    return recovery.cleanupOldData(maxAgeDays);
  });
  
  ipcMain.handle('get-error-log', async () => {
    return { errors: recovery.errorLog.slice(-20) };
  });
  
  // Wrap operations with retry
  ipcMain.handle('operation-with-retry', async (event, operationName, ...args) => {
    return recovery.withRetry(async () => {
      // Operations would be mapped here
      console.log('[Retry]', operationName, args);
      return { success: true };
    });
  });
}

module.exports = { setupErrorRecoveryHandlers, ErrorRecovery };
