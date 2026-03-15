use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use uuid::Uuid;
use std::time::{SystemTime, UNIX_EPOCH};

// HMAC type alias
type HmacSha256 = Hmac<Sha256>;

/// Generates a unique signature for bot-generated content
/// This signature can be used to prove the content was AI-generated
pub fn generate_bot_signature(
    user_id: &str,
    content: &str,
    secret_key: &str,
) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let content_hash = hash_content(content);
    
    // Create signature data
    let signature_data = format!("{}:{}:{}:{}", user_id, timestamp, content_hash, Uuid::new_v4());
    
    // Create HMAC
    let mut mac = HmacSha256::new_from_slice(secret_key.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(signature_data.as_bytes());
    
    let result = mac.finalize();
    let signature = hex::encode(result.into_bytes());
    
    format!("{}.{}", signature_data, signature)
}

/// Verifies a bot signature
pub fn verify_bot_signature(
    signature: &str,
    secret_key: &str,
) -> Result<BotSignatureData, String> {
    let parts: Vec<&str> = signature.split('.').collect();
    if parts.len() != 2 {
        return Err("Invalid signature format".to_string());
    }
    
    let signature_data = parts[0];
    let provided_hmac = parts[1];
    
    // Verify HMAC
    let mut mac = HmacSha256::new_from_slice(secret_key.as_bytes())
        .map_err(|e| e.to_string())?;
    mac.update(signature_data.as_bytes());
    
    let result = mac.finalize();
    let computed_hmac = hex::encode(result.into_bytes());
    
    if computed_hmac != provided_hmac {
        return Err("Invalid signature".to_string());
    }
    
    // Parse signature data
    let data_parts: Vec<&str> = signature_data.split(':').collect();
    if data_parts.len() != 4 {
        return Err("Invalid signature data format".to_string());
    }
    
    Ok(BotSignatureData {
        user_id: data_parts[0].to_string(),
        timestamp: data_parts[1].parse().unwrap_or(0),
        content_hash: data_parts[2].to_string(),
        nonce: data_parts[3].to_string(),
    })
}

#[derive(Debug, Clone)]
pub struct BotSignatureData {
    pub user_id: String,
    pub timestamp: u64,
    pub content_hash: String,
    pub nonce: String,
}

/// Generates SHA256 hash of content
pub fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

/// Generates email headers for bot tracking
pub fn generate_email_headers(
    user_id: &str,
    content: &str,
    secret_key: &str,
    version: &str,
    mode: &str,
    confidence: f64,
) -> Vec<(String, String)> {
    let signature = generate_bot_signature(user_id, content, secret_key);
    let content_hash = hash_content(content);
    let session_id = Uuid::new_v4().to_string();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    vec![
        ("X-OpenEgo-Bot".to_string(), "true".to_string()),
        ("X-OpenEgo-Version".to_string(), version.to_string()),
        ("X-OpenEgo-Session".to_string(), session_id),
        ("X-OpenEgo-Timestamp".to_string(), timestamp.to_string()),
        ("X-OpenEgo-Signature".to_string(), signature),
        ("X-OpenEgo-Content-Hash".to_string(), content_hash),
        ("X-OpenEgo-Mode".to_string(), mode.to_string()),
        ("X-OpenEgo-Confidence".to_string(), format!("{:.2}", confidence)),
    ]
}

/// Adds invisible watermark to text content
/// Uses zero-width characters that are invisible to humans but detectable
pub fn add_invisible_watermark(content: &str, user_id: &str) -> String {
    // Zero-width characters for encoding
    const ZW_SPACE: char = '\u{200B}';      // Zero-width space
    const ZW_NON_JOINER: char = '\u{200C}'; // Zero-width non-joiner
    const ZW_JOINER: char = '\u{200D}';     // Zero-width joiner
    
    // Create watermark data
    let watermark_data = format!("openego:{}", user_id);
    let encoded = base64::encode(watermark_data);
    
    // Convert to zero-width binary representation
    let mut watermark = String::new();
    watermark.push(ZW_SPACE); // Start marker
    
    for byte in encoded.bytes() {
        for i in 0..8 {
            let bit = (byte >> (7 - i)) & 1;
            if bit == 1 {
                watermark.push(ZW_JOINER);
            } else {
                watermark.push(ZW_NON_JOINER);
            }
        }
    }
    
    watermark.push(ZW_SPACE); // End marker
    
    // Insert watermark at the end of content (before signature if exists)
    format!("{}{}\n\n", content, watermark)
}

/// Extracts and verifies invisible watermark from text
pub fn extract_invisible_watermark(content: &str) -> Option<String> {
    const ZW_SPACE: char = '\u{200B}';
    const ZW_NON_JOINER: char = '\u{200C}';
    const ZW_JOINER: char = '\u{200D}';
    
    // Find watermark between zero-width space markers
    let chars: Vec<char> = content.chars().collect();
    let mut watermark_start = None;
    let mut watermark_end = None;
    
    for (i, &c) in chars.iter().enumerate() {
        if c == ZW_SPACE {
            if watermark_start.is_none() {
                watermark_start = Some(i);
            } else if watermark_end.is_none() {
                watermark_end = Some(i);
                break;
            }
        }
    }
    
    let start = watermark_start?;
    let end = watermark_end?;
    
    // Extract binary data
    let watermark_chars = &chars[start + 1..end];
    let mut bytes = Vec::new();
    let mut current_byte: u8 = 0;
    let mut bit_count = 0;
    
    for &c in watermark_chars {
        current_byte <<= 1;
        if c == ZW_JOINER {
            current_byte |= 1;
        }
        bit_count += 1;
        
        if bit_count == 8 {
            bytes.push(current_byte);
            current_byte = 0;
            bit_count = 0;
        }
    }
    
    // Decode base64
    let decoded = String::from_utf8(bytes).ok()?;
    
    if decoded.starts_with("openego:") {
        Some(decoded.replace("openego:", ""))
    } else {
        None
    }
}

/// Generates a certificate for disputed bot activity
pub fn generate_bot_certificate(
    activity_id: &str,
    user_id: &str,
    timestamp: i64,
    platform: &str,
    recipient: &str,
    content_preview: &str,
    content_hash: &str,
    bot_signature: &str,
    confidence_score: f64,
    mode: &str,
) -> String {
    let certificate_id = Uuid::new_v4().to_string();
    let issued_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    format!(r#"===============================================
OPENEGO BOT ACTIVITY CERTIFICATE
===============================================

Certificate ID: {}
Issued At: {}

CLAIM DETAILS
-------------
Activity ID: {}
User ID: {}
Platform: {}
Recipient: {}
Timestamp: {}
Mode: {}

EVIDENCE
--------
Content Preview: {}
Content Hash: {}
Bot Signature: {}
Confidence Score: {:.2}%

VERIFICATION
------------
This certificate confirms that the above communication
was generated by OpenEgo AI on behalf of the user.

The bot signature can be cryptographically verified
using the OpenEgo verification system.

===============================================
This is an official record of bot activity.
===============================================
"#,
        certificate_id,
        issued_at,
        activity_id,
        user_id,
        platform,
        recipient,
        timestamp,
        mode,
        content_preview,
        content_hash,
        bot_signature,
        confidence_score * 100.0,
    )
}

/// Simple base64 encoding (for watermark)
mod base64 {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    pub fn encode(input: String) -> String {
        let bytes = input.as_bytes();
        let mut result = String::new();
        
        for chunk in bytes.chunks(3) {
            let buf = match chunk.len() {
                1 => [chunk[0], 0, 0],
                2 => [chunk[0], chunk[1], 0],
                3 => [chunk[0], chunk[1], chunk[2]],
                _ => unreachable!(),
            };
            
            let b = ((buf[0] as u32) << 16) | ((buf[1] as u32) << 8) | (buf[2] as u32);
            
            result.push(ALPHABET[((b >> 18) & 0x3F) as usize] as char);
            result.push(ALPHABET[((b >> 12) & 0x3F) as usize] as char);
            
            if chunk.len() > 1 {
                result.push(ALPHABET[((b >> 6) & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
            
            if chunk.len() > 2 {
                result.push(ALPHABET[(b & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
        }
        
        result
    }
}
