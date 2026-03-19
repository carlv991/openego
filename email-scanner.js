const { ipcMain } = require('electron');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');
const os = require('os');

// AppleScript to get unread emails from Mail app
const GET_UNREAD_EMAILS_SCRIPT = `
tell application "Mail"
    set unreadEmails to {}
    
    repeat with acct in accounts
        set mb to mailbox "INBOX" of acct
        set msgs to messages of mb whose read status is false
        
        repeat with msg in msgs
            try
                set msgSubject to subject of msg
                set msgSender to sender of msg
                set msgContent to content of msg
                set msgDate to date received of msg
                set msgId to id of msg as string
                
                set emailData to "ID:" & msgId & "|SUBJECT:" & msgSubject & "|FROM:" & msgSender & "|DATE:" & msgDate & "|CONTENT:" & msgContent & "\\n---END_EMAIL---\\n"
                set end of unreadEmails to emailData
                
                if length of unreadEmails >= 10 then exit repeat
            on error
                -- Skip emails that can't be read
            end try
        end repeat
        
        if length of unreadEmails >= 10 then exit repeat
    end repeat
    
    return unreadEmails as string
end tell
`;

// AppleScript to get recent emails (even if read)
const GET_RECENT_EMAILS_SCRIPT = `
tell application "Mail"
    set recentEmails to {}
    
    repeat with acct in accounts
        try
            set mb to mailbox "INBOX" of acct
            set msgs to messages 1 thru 20 of mb
            
            repeat with msg in msgs
                try
                    set msgSubject to subject of msg
                    set msgSender to sender of msg
                    set msgContent to content of msg
                    set msgDate to date received of msg
                    set msgId to id of msg as string
                    set isRead to read status of msg
                    
                    set emailData to "ID:" & msgId & "|SUBJECT:" & msgSubject & "|FROM:" & msgSender & "|DATE:" & msgDate & "|READ:" & isRead & "|CONTENT:" & msgContent & "\\n---END_EMAIL---\\n"
                    set end of recentEmails to emailData
                on error
                    -- Skip emails that can't be read
                end try
            end repeat
        on error
            -- Skip accounts that can't be accessed
        end try
    end repeat
    
    return recentEmails as string
end tell
`;

// AppleScript to reply to an email
const REPLY_TO_EMAIL_SCRIPT = (messageId, replyContent) => `
tell application "Mail"
    set foundMessage to null
    
    -- Search for message across all accounts
    repeat with acct in accounts
        try
            set mb to mailbox "INBOX" of acct
            repeat with msg in messages of mb
                if (id of msg as string) = "${messageId}" then
                    set foundMessage to msg
                    exit repeat
                end if
            end repeat
            if foundMessage is not null then exit repeat
        on error
            -- Continue to next account
        end try
    end repeat
    
    if foundMessage is not null then
        set replyMessage to reply foundMessage
        set content of replyMessage to "${replyContent.replace(/"/g, '\\"').replace(/\\n/g, '\\n')}"
        activate
        return "Reply created successfully"
    else
        return "Message not found"
    end if
end tell
`;

// Parse AppleScript email output
function parseAppleScriptEmails(output) {
    if (!output || output.trim() === '') {
        return [];
    }
    
    const emails = [];
    const emailBlocks = output.split('---END_EMAIL---');
    
    for (const block of emailBlocks) {
        if (!block.trim()) continue;
        
        const email = {};
        const lines = block.split('|');
        
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;
            
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            
            switch (key) {
                case 'ID':
                    email.id = value;
                    break;
                case 'SUBJECT':
                    email.subject = value;
                    break;
                case 'FROM':
                    email.from = value;
                    break;
                case 'DATE':
                    email.date = value;
                    break;
                case 'READ':
                    email.read = value === 'true';
                    break;
                case 'CONTENT':
                    // Clean up content
                    email.content = value
                        .replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .substring(0, 2000); // Limit content length
                    break;
            }
        }
        
        if (email.id && email.subject) {
            emails.push(email);
        }
    }
    
    return emails;
}

// Setup email scanning handlers
function setupEmailScannerHandlers(mainWindow) {
    // Get unread emails from Mail app
    ipcMain.handle('mail:get-unread', async () => {
        if (process.platform !== 'darwin') {
            return { 
                success: false, 
                error: 'Apple Mail integration only available on macOS',
                emails: []
            };
        }
        
        try {
            console.log('[Email Scanner] Fetching unread emails from Apple Mail...');
            
            const { stdout, stderr } = await execAsync(`osascript -e '${GET_UNREAD_EMAILS_SCRIPT}'`, {
                timeout: 30000 // 30 second timeout
            });
            
            if (stderr) {
                console.error('[Email Scanner] AppleScript stderr:', stderr);
            }
            
            const emails = parseAppleScriptEmails(stdout);
            
            console.log(`[Email Scanner] Found ${emails.length} unread emails`);
            
            // Cache emails for later use
            const cachePath = path.join(os.homedir(), '.openego_emails_cache.json');
            fs.writeFileSync(cachePath, JSON.stringify({
                timestamp: new Date().toISOString(),
                emails: emails
            }));
            
            return {
                success: true,
                emails: emails,
                count: emails.length
            };
            
        } catch (error) {
            console.error('[Email Scanner] Error:', error);
            return {
                success: false,
                error: error.message,
                emails: []
            };
        }
    });
    
    // Get recent emails (for training)
    ipcMain.handle('mail:get-recent', async () => {
        if (process.platform !== 'darwin') {
            return { 
                success: false, 
                error: 'Apple Mail integration only available on macOS',
                emails: []
            };
        }
        
        try {
            console.log('[Email Scanner] Fetching recent emails from Apple Mail...');
            
            const { stdout, stderr } = await execAsync(`osascript -e '${GET_RECENT_EMAILS_SCRIPT}'`, {
                timeout: 30000
            });
            
            if (stderr) {
                console.error('[Email Scanner] AppleScript stderr:', stderr);
            }
            
            const emails = parseAppleScriptEmails(stdout);
            
            console.log(`[Email Scanner] Found ${emails.length} recent emails`);
            
            return {
                success: true,
                emails: emails,
                count: emails.length
            };
            
        } catch (error) {
            console.error('[Email Scanner] Error:', error);
            return {
                success: false,
                error: error.message,
                emails: []
            };
        }
    });
    
    // Reply to an email
    ipcMain.handle('mail:reply', async (event, messageId, content) => {
        if (process.platform !== 'darwin') {
            return { 
                success: false, 
                error: 'Apple Mail integration only available on macOS'
            };
        }
        
        try {
            console.log(`[Email Scanner] Creating reply to message ${messageId}...`);
            
            const script = REPLY_TO_EMAIL_SCRIPT(messageId, content);
            const { stdout, stderr } = await execAsync(`osascript -e '${script}'`, {
                timeout: 10000
            });
            
            if (stderr) {
                console.error('[Email Scanner] AppleScript stderr:', stderr);
            }
            
            return {
                success: stdout.includes('successfully'),
                message: stdout.trim()
            };
            
        } catch (error) {
            console.error('[Email Scanner] Reply error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });
    
    // Check if Mail app is running
    ipcMain.handle('mail:check-running', async () => {
        if (process.platform !== 'darwin') {
            return { running: false };
        }
        
        try {
            const { stdout } = await execAsync('pgrep -x "Mail"');
            return { running: stdout.trim() !== '' };
        } catch {
            return { running: false };
        }
    });
    
    // Start Mail app if not running
    ipcMain.handle('mail:start', async () => {
        if (process.platform !== 'darwin') {
            return { success: false, error: 'macOS only' };
        }
        
        try {
            await execAsync('open -a Mail');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    
    console.log('[Email Scanner] Handlers registered');
}

module.exports = { setupEmailScannerHandlers };
