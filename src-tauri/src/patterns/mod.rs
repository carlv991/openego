use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedTask {
    pub task_type: TaskType,
    pub title: String,
    pub description: String,
    pub priority: Priority,
    pub confidence: f64,
    pub related_email_id: String,
    pub action_required: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum TaskType {
    Payment,
    Review,
    Meeting,
    FollowUp,
    Deadline,
    Question,
    Unsubscribe,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum Priority {
    Critical,
    Urgent,
    Normal,
    Low,
}

pub struct EmailPatternDetector {
    patterns: Vec<DetectionPattern>,
}

struct DetectionPattern {
    regex: Regex,
    task_type: TaskType,
    priority: Priority,
    confidence: f64,
    title_template: String,
}

impl EmailPatternDetector {
    pub fn new() -> Self {
        let patterns = vec![
            // Payment/Invoice patterns
            DetectionPattern {
                regex: Regex::new(r"(?i)(payment due|invoice|bill|overdue|unpaid|outstanding balance|amount due|pay by|due date|payment required)").unwrap(),
                task_type: TaskType::Payment,
                priority: Priority::Critical,
                confidence: 0.9,
                title_template: "Payment Required - {subject}".to_string(),
            },
            // Review/Approval patterns
            DetectionPattern {
                regex: Regex::new(r"(?i)(please review|need your approval|sign off|check this|feedback needed|your thoughts|review required)").unwrap(),
                task_type: TaskType::Review,
                priority: Priority::Urgent,
                confidence: 0.85,
                title_template: "Review Required - {subject}".to_string(),
            },
            // Meeting/Call patterns
            DetectionPattern {
                regex: Regex::new(r"(?i)(schedule a (call|meeting)|are you available|free to chat|jump on a call|quick sync|30 minutes)").unwrap(),
                task_type: TaskType::Meeting,
                priority: Priority::Normal,
                confidence: 0.8,
                title_template: "Meeting Request - {sender}".to_string(),
            },
            // Follow-up patterns
            DetectionPattern {
                regex: Regex::new(r"(?i)(follow(ing)? up|checking in|any update|status|reminder|don't forget)").unwrap(),
                task_type: TaskType::FollowUp,
                priority: Priority::Urgent,
                confidence: 0.75,
                title_template: "Follow Up - {subject}".to_string(),
            },
            // Deadline patterns
            DetectionPattern {
                regex: Regex::new(r"(?i)(deadline|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|end of day|eod|asap|urgent)").unwrap(),
                task_type: TaskType::Deadline,
                priority: Priority::Urgent,
                confidence: 0.85,
                title_template: "Deadline Approaching - {subject}".to_string(),
            },
            // Question/Response needed
            DetectionPattern {
                regex: Regex::new(r"(?i)(quick question|can you|could you|would you|what do you think|your opinion)").unwrap(),
                task_type: TaskType::Question,
                priority: Priority::Normal,
                confidence: 0.7,
                title_template: "Response Needed - {sender}".to_string(),
            },
            // Unsubscribe patterns
            DetectionPattern {
                regex: Regex::new(r"(?i)(unsubscribe|opt.out|no longer interested|stop receiving|marketing|newsletter|promotional)").unwrap(),
                task_type: TaskType::Unsubscribe,
                priority: Priority::Low,
                confidence: 0.6,
                title_template: "Consider Unsubscribing - {sender}".to_string(),
            },
        ];

        EmailPatternDetector { patterns }
    }

    pub fn detect_tasks(&self, subject: &str, body: &str, sender: &str, email_id: &str) -> Vec<DetectedTask> {
        let content = format!("{} {}", subject, body);
        let mut detected_tasks = Vec::new();

        for pattern in &self.patterns {
            if pattern.regex.is_match(&content) {
                let title = pattern.title_template
                    .replace("{subject}", subject)
                    .replace("{sender}", sender);

                let description = format!(
                    "From: {}\nSubject: {}\nDetected: {:?}",
                    sender, subject, pattern.task_type
                );

                let action_required = match pattern.task_type {
                    TaskType::Payment => "Review and process payment".to_string(),
                    TaskType::Review => "Review and provide feedback".to_string(),
                    TaskType::Meeting => "Respond with availability".to_string(),
                    TaskType::FollowUp => "Provide status update".to_string(),
                    TaskType::Deadline => "Complete before deadline".to_string(),
                    TaskType::Question => "Answer the question".to_string(),
                    TaskType::Unsubscribe => "Unsubscribe if not needed".to_string(),
                    TaskType::Unknown => "Review email".to_string(),
                };

                detected_tasks.push(DetectedTask {
                    task_type: pattern.task_type.clone(),
                    title,
                    description,
                    priority: pattern.priority.clone(),
                    confidence: pattern.confidence,
                    related_email_id: email_id.to_string(),
                    action_required,
                });
            }
        }

        // If no patterns matched, create a generic task for important senders
        if detected_tasks.is_empty() && self.is_important_sender(sender) {
            detected_tasks.push(DetectedTask {
                task_type: TaskType::Unknown,
                title: format!("Review Email - {}", subject),
                description: format!("From: {}\nSubject: {}", sender, subject),
                priority: Priority::Normal,
                confidence: 0.5,
                related_email_id: email_id.to_string(),
                action_required: "Review and respond if needed".to_string(),
            });
        }

        detected_tasks
    }

    fn is_important_sender(&self, sender: &str) -> bool {
        let important_keywords = [
            "boss", "manager", "ceo", "founder", "client", "customer",
            "support", "billing", "legal", "hr", "finance"
        ];
        
        let sender_lower = sender.to_lowercase();
        important_keywords.iter().any(|kw| sender_lower.contains(kw))
    }

    pub fn should_auto_respond(&self, task: &DetectedTask, auto_pilot_enabled: bool) -> bool {
        if !auto_pilot_enabled {
            return false;
        }

        // Only auto-respond to certain task types with high confidence
        match task.task_type {
            TaskType::Meeting => task.confidence > 0.85,
            TaskType::Question => task.confidence > 0.9,
            TaskType::FollowUp => task.confidence > 0.9,
            _ => false,
        }
    }

    pub fn get_suggested_response(&self, task: &DetectedTask) -> String {
        match task.task_type {
            TaskType::Meeting => {
                "Thanks for reaching out! I'd be happy to connect. Here are some times that work for me: [suggest times]. Looking forward to it.".to_string()
            }
            TaskType::Question => {
                "Great question! Let me look into this and get back to you shortly.".to_string()
            }
            TaskType::FollowUp => {
                "Thanks for following up! I'm still working on this and will have an update for you soon.".to_string()
            }
            _ => "Thanks for your message. I'll review and respond shortly.".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payment_detection() {
        let detector = EmailPatternDetector::new();
        let tasks = detector.detect_tasks(
            "Your invoice is overdue",
            "Please pay the outstanding balance of $500",
            "billing@company.com",
            "email123"
        );
        
        assert!(!tasks.is_empty());
        assert!(matches!(tasks[0].task_type, TaskType::Payment));
        assert!(matches!(tasks[0].priority, Priority::Critical));
    }

    #[test]
    fn test_review_detection() {
        let detector = EmailPatternDetector::new();
        let tasks = detector.detect_tasks(
            "Please review the proposal",
            "Can you take a look and provide feedback?",
            "colleague@company.com",
            "email456"
        );
        
        assert!(!tasks.is_empty());
        assert!(matches!(tasks[0].task_type, TaskType::Review));
    }
}
