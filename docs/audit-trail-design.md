# OpenEgo Audit Trail & Bot Fingerprinting System

## Overview
System to track all bot actions and provide provable evidence that a communication was AI-generated (not the user).

---

## 1. Activity Tracking for Auto-Pilot Mode

### Database Schema
```sql
-- Activity Log Table
CREATE TABLE activity_log (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL, -- 'auto-pilot', 'co-pilot', 'manual'
    action_type TEXT NOT NULL, -- 'email_sent', 'message_sent', 'todo_created', etc.
    platform TEXT NOT NULL, -- 'gmail', 'telegram', 'slack', etc.
    recipient TEXT,
    subject TEXT,
    content_preview TEXT, -- First 200 chars
    content_hash TEXT, -- SHA256 of full content for verification
    confidence_score REAL,
    approved_by_user BOOLEAN,
    metadata JSON -- Flexible storage for additional data
);

-- Create indexes for fast querying
CREATE INDEX idx_activity_user_time ON activity_log(user_id, timestamp);
CREATE INDEX idx_activity_action ON activity_log(action_type);
CREATE INDEX idx_activity_platform ON activity_log(platform);
```

### Tracked Actions
| Action Type | Description | Data Captured |
|-------------|-------------|---------------|
| `email_sent` | Email sent by bot | recipient, subject, content_hash, thread_id |
| `message_sent` | Chat message sent | platform, channel/recipient, content_hash |
| `todo_created` | Task auto-created | source_email_id, detected_pattern, priority |
| `response_suggested` | Suggestion shown | user_action (accepted/rejected/edited) |
| `calendar_event` | Meeting scheduled | event_details, attendees |
| `api_call` | External API call | endpoint, params_hash, response_status |

### Activity Dashboard UI
- **Timeline view** of all bot actions
- **Filter by** date, platform, action type
- **Search** by recipient or subject
- **Export** to PDF/CSV for records

---

## 2. Bot Fingerprinting System

### Approach: Hidden Headers + Invisible Watermark

#### A. Email Headers (Most Reliable)
Add custom headers to all bot-sent emails:

```
X-OpenEgo-Bot: true
X-OpenEgo-Version: 0.1.0
X-OpenEgo-Session: uuid-v4-session-id
X-OpenEgo-Timestamp: ISO-8601-timestamp
X-OpenEgo-Signature: HMAC-SHA256-signature
X-OpenEgo-Confidence: 0.92
```

**Verification Process:**
1. User provides email with dispute
2. Check for X-OpenEgo headers
3. Verify HMAC signature against user's secret key
4. Look up in activity_log by content_hash
5. Generate official "Bot Activity Certificate"

#### B. Invisible Text Watermark (Fallback)
For platforms without headers (WhatsApp, iMessage, etc.):

```javascript
// Add zero-width characters or invisible Unicode
const BOT_WATERMARK = '\u200B\u200C\u200D'; // Zero-width spaces
const BOT_SIGNATURE = Buffer.from(JSON.stringify({
    bot: 'openego',
    version: '0.1.0',
    timestamp: Date.now(),
    session: sessionId
})).toString('base64');

// Embed at end of message (invisible to humans)
function addWatermark(text) {
    return text + '\n\n' + BOT_WATERMARK + BOT_SIGNATURE;
}

// Extract and verify
function extractWatermark(text) {
    const match = text.match(/\u200B\u200C\u200D([A-Za-z0-9+/=]+)$/);
    if (match) {
        return JSON.parse(Buffer.from(match[1], 'base64').toString());
    }
    return null;
}
```

#### C. Image Watermark (For Image Attachments)
If bot sends images, embed invisible watermark using steganography:

```rust
// Using steganography library
use steganography::util::file_to_bytes;
use steganography::lsb::Lsb;

fn embed_watermark(image_path: &str, signature: &str) -> Vec<u8> {
    let carrier = file_to_bytes(image_path);
    let lsb = Lsb::new(signature.as_bytes(), &carrier);
    lsb.embed()
}
```

---

## 3. Auto-Pilot Session Tracking

### Session Management
```rust
struct AutoPilotSession {
    session_id: String,
    user_id: String,
    started_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    status: SessionStatus, // Active, Expired, Cancelled
    rules: AutoPilotRules,
    actions: Vec<LoggedAction>,
}

struct AutoPilotRules {
    allowed_platforms: Vec<String>,
    max_confidence: f32,
    require_approval_above: f32,
    blocked_recipients: Vec<String>,
}
```

### Daily/Weekly Reports
- Email summary of all bot actions
- Highlight high-confidence vs low-confidence responses
- User can review and correct

---

## 4. Dispute Resolution System

### "Bot Activity Certificate"
When user needs to prove it was the bot:

```json
{
  "certificate_id": "cert_uuid",
  "issued_at": "2026-03-15T16:49:00Z",
  "user_id": "user_uuid",
  "claim": {
    "message_id": "msg_uuid",
    "platform": "gmail",
    "sent_at": "2026-03-15T14:30:00Z",
    "recipient": "client@example.com"
  },
  "evidence": {
    "headers_present": true,
    "header_signature_valid": true,
    "session_log_found": true,
    "content_hash_match": true,
    "confidence_score": 0.89,
    "auto_pilot_active": true
  },
  "verification_hash": "sha256_of_all_above",
  "signed_by": "openego_system_key"
}
```

### User Flow
1. User receives complaint: "You promised X in email!"
2. User opens OpenEgo → Activity Log
3. Finds the disputed message
4. Clicks "Generate Certificate"
5. PDF generated with:
   - Timestamp proof
   - Bot signature verification
   - Session details
   - Confidence score
6. User can share this as evidence

---

## 5. Privacy Considerations

### What to Store
✅ DO store:
- Timestamps
- Recipients (hashed?)
- Subject lines
- Content hashes (not full content for privacy)
- Action types
- Confidence scores

❌ DON'T store:
- Full message content (unless user opts in)
- Attachments
- Recipient names (store email hashes instead)

### Retention Policy
- Default: 90 days
- User can extend to 1 year or unlimited
- Auto-delete after retention period

---

## 6. Implementation Priority

| Feature | Priority | Effort | Impact |
|---------|----------|--------|--------|
| Activity Log DB | P0 | 2h | High |
| Email Headers | P0 | 1h | High |
| Dashboard UI | P1 | 4h | Medium |
| Invisible Watermark | P2 | 4h | Medium |
| Certificate Generator | P2 | 3h | Medium |
| Session Management | P1 | 3h | High |

---

## 7. User Settings

```
Settings → Privacy & Audit
├── Activity Logging
│   ├── Enable detailed logging [Toggle ON]
│   ├── Retention period [90 days / 1 year / Forever]
│   └── Store full message content [Toggle OFF]
├── Bot Identification
│   ├── Add headers to emails [Toggle ON]
│   ├── Add invisible watermark [Toggle ON]
│   └── Include confidence score [Toggle ON]
├── Reports
│   ├── Daily summary email [Toggle OFF]
│   ├── Weekly activity report [Toggle ON]
│   └── Auto-archive old logs [Toggle ON]
└── Dispute Resolution
    ├── Generate certificate [Button]
    ├── Export all logs [Button]
    └── Contact support [Button]
```

---

## Next Steps

1. Add `activity_log` table to database
2. Create `AuditLogger` service in Rust backend
3. Add email headers to Gmail integration
4. Build Activity Log UI in settings
5. Create certificate generation endpoint
