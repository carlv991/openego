

// ==================== EMAIL PATTERN DETECTION ====================

const patternDetection = {
    enabled: true,
    autoCreateTodos: true,
    minConfidence: 0.7
};

// Email patterns for auto-detecting tasks (frontend fallback)
const emailPatterns = {
    payment: {
        regex: /payment due|invoice|bill|overdue|unpaid|outstanding balance|amount due|pay by|due date/i,
        type: 'payment',
        priority: 'critical',
        confidence: 0.9,
        titleTemplate: 'Payment Required - {subject}'
    },
    review: {
        regex: /please review|need your approval|sign off|check this|feedback needed|your thoughts|review required/i,
        type: 'review',
        priority: 'urgent',
        confidence: 0.85,
        titleTemplate: 'Review Required - {subject}'
    },
    meeting: {
        regex: /schedule a (call|meeting)|are you available|free to chat|jump on a call|quick sync/i,
        type: 'meeting',
        priority: 'normal',
        confidence: 0.8,
        titleTemplate: 'Meeting Request - {sender}'
    },
    followup: {
        regex: /follow(ing)? up|checking in|any update|status|reminder/i,
        type: 'followup',
        priority: 'urgent',
        confidence: 0.75,
        titleTemplate: 'Follow Up - {subject}'
    },
    deadline: {
        regex: /deadline|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|end of day|eod|asap/i,
        type: 'deadline',
        priority: 'urgent',
        confidence: 0.85,
        titleTemplate: 'Deadline Approaching - {subject}'
    }
};

// Detect tasks from email content
async function detectTasksFromEmail(subject, body, sender, emailId) {
    const content = `${subject} ${body}`;
    const detectedTasks = [];
    
    // Check each pattern
    for (const [key, pattern] of Object.entries(emailPatterns)) {
        if (pattern.regex.test(content)) {
            const title = pattern.titleTemplate
                .replace('{subject}', subject.length > 40 ? subject.substring(0, 40) + '...' : subject)
                .replace('{sender}', sender);
            
            detectedTasks.push({
                type: pattern.type,
                title: title,
                description: `From: ${sender}\nSubject: ${subject}`,
                priority: pattern.priority,
                confidence: pattern.confidence,
                emailId: emailId,
                actionRequired: getActionRequired(pattern.type)
            });
        }
    }
    
    // Try to use backend detection if available
    try {
        if (window.__TAURI__) {
            const { invoke } = window.__TAURI__.core;
            const result = await invoke('detect_tasks_from_email', {
                subject,
                body,
                sender,
                emailId
            });
            
            if (result.success && result.data.tasks.length > 0) {
                return result.data.tasks;
            }
        }
    } catch (error) {
        console.log('Backend pattern detection not available, using frontend fallback');
    }
    
    return detectedTasks;
}

function getActionRequired(type) {
    const actions = {
        payment: 'Review and process payment',
        review: 'Review and provide feedback',
        meeting: 'Respond with availability',
        followup: 'Provide status update',
        deadline: 'Complete before deadline',
        question: 'Answer the question',
        default: 'Review and respond'
    };
    return actions[type] || actions.default;
}

// Auto-process email (create todos, suggest responses)
async function autoProcessEmail(emailData) {
    const { subject, body, sender, emailId, userId, autoPilotEnabled } = emailData;
    
    // Detect tasks
    const tasks = await detectTasksFromEmail(subject, body, sender, emailId);
    
    if (tasks.length === 0) {
        return { tasksCreated: [], message: 'No tasks detected' };
    }
    
    const results = {
        tasksCreated: [],
        suggestions: [],
        notifications: []
    };
    
    // Create todos for detected tasks
    for (const task of tasks) {
        if (task.confidence >= patternDetection.minConfidence) {
            const newTodo = {
                id: 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                title: task.title,
                description: task.description,
                priority: task.priority,
                status: 'open',
                related_type: 'email',
                related_id: task.emailId,
                created_at: Date.now() / 1000
            };
            
            dashboardState.todos.unshift(newTodo);
            results.tasksCreated.push(newTodo);
            
            // Send notification for critical tasks
            if (task.priority === 'critical') {
                await sendNotification(
                    'Critical Task Detected',
                    task.title,
                    'critical'
                );
                results.notifications.push({
                    type: 'critical',
                    title: task.title
                });
            }
            
            // Get suggested response
            if (autoPilotEnabled && shouldAutoRespond(task)) {
                const response = getSuggestedResponse(task.type);
                results.suggestions.push({
                    taskId: newTodo.id,
                    type: task.type,
                    response: response
                });
            }
        }
    }
    
    // Update UI
    if (dashboardState.currentTab === 'todos') {
        renderTodos(dashboardState.todos);
        updateTodoStats(dashboardState.todos);
    }
    
    return results;
}

function shouldAutoRespond(task) {
    // Only auto-respond to certain types with high confidence
    const autoRespondTypes = ['meeting', 'question', 'followup'];
    return autoRespondTypes.includes(task.type) && task.confidence > 0.8;
}

function getSuggestedResponse(type) {
    const responses = {
        meeting: "Thanks for reaching out! I'd be happy to connect. Here are some times that work for me: [suggest times]. Looking forward to it.",
        question: "Great question! Let me look into this and get back to you shortly.",
        followup: "Thanks for following up! I'm still working on this and will have an update for you soon.",
        review: "I'll review this and get back to you with feedback by [timeframe].",
        payment: "Thank you for the reminder. I'll process this payment shortly.",
        default: "Thanks for your message. I'll review and respond shortly."
    };
    return responses[type] || responses.default;
}

// Simulate email processing (for demo/testing)
async function simulateEmailProcessing() {
    const testEmails = [
        {
            subject: 'Invoice #1234 - Payment Due',
            body: 'Your payment of $500 is overdue. Please pay by Friday.',
            sender: 'billing@company.com',
            emailId: 'test_email_001'
        },
        {
            subject: 'Please review the Q1 report',
            body: 'Can you take a look and provide your feedback?',
            sender: 'boss@company.com',
            emailId: 'test_email_002'
        },
        {
            subject: 'Quick sync tomorrow?',
            body: 'Are you free for a 15 min call tomorrow afternoon?',
            sender: 'colleague@company.com',
            emailId: 'test_email_003'
        }
    ];
    
    console.log('Processing test emails...');
    
    for (const email of testEmails) {
        const result = await autoProcessEmail({
            ...email,
            userId: dashboardState.userId,
            autoPilotEnabled: notificationState.autoPilotMode
        });
        
        console.log(`Processed: ${email.subject}`, result);
    }
    
    // Update stats
    updateTodoStats(dashboardState.todos);
}

// Example: Run simulation (comment out in production)
// setTimeout(simulateEmailProcessing, 3000);
