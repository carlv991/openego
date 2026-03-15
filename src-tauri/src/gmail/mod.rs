use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

const GMAIL_API_BASE: &str = "https://www.googleapis.com/gmail/v1/users/me";
const OAUTH_BASE: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

// For development - these should be environment variables in production
const CLIENT_ID: &str = "YOUR_CLIENT_ID"; // Will be set by user
const CLIENT_SECRET: &str = "YOUR_CLIENT_SECRET"; // Will be set by user
const REDIRECT_URI: &str = "http://localhost:8080/oauth/callback";

#[derive(Debug, Serialize, Deserialize)]
pub struct GmailMessage {
    pub id: String,
    pub thread_id: String,
    pub label_ids: Vec<String>,
    pub snippet: String,
    pub payload: Option<MessagePayload>,
    pub internal_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessagePayload {
    pub mime_type: String,
    pub headers: Vec<MessageHeader>,
    pub parts: Option<Vec<MessagePart>>,
    pub body: Option<MessageBody>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessageHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessagePart {
    pub mime_type: String,
    pub headers: Vec<MessageHeader>,
    pub body: MessageBody,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessageBody {
    pub data: Option<String>,
    pub size: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub expires_in: i32,
    pub refresh_token: Option<String>,
    pub scope: String,
    pub token_type: String,
}

pub struct GmailClient {
    client: Client,
    access_token: String,
}

impl GmailClient {
    pub fn new(access_token: String) -> Self {
        GmailClient {
            client: Client::new(),
            access_token,
        }
    }
    
    pub fn get_auth_url() -> String {
        let scopes = vec![
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
        ];
        
        let scope_string = scopes.join(" ");
        let params = vec![
            ("client_id", CLIENT_ID),
            ("redirect_uri", REDIRECT_URI),
            ("response_type", "code"),
            ("scope", &scope_string),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ];
        
        let query = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        
        format!("{}?{}", OAUTH_BASE, query)
    }
    
    pub async fn exchange_code_for_token(code: &str) -> Result<OAuthTokenResponse, reqwest::Error> {
        let client = Client::new();
        
        let mut params = HashMap::new();
        params.insert("code", code);
        params.insert("client_id", CLIENT_ID);
        params.insert("client_secret", CLIENT_SECRET);
        params.insert("redirect_uri", REDIRECT_URI);
        params.insert("grant_type", "authorization_code");
        
        let response = client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await?
            .json::<OAuthTokenResponse>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn refresh_token(refresh_token: &str) -> Result<OAuthTokenResponse, reqwest::Error> {
        let client = Client::new();
        
        let mut params = HashMap::new();
        params.insert("refresh_token", refresh_token);
        params.insert("client_id", CLIENT_ID);
        params.insert("client_secret", CLIENT_SECRET);
        params.insert("grant_type", "refresh_token");
        
        let response = client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await?
            .json::<OAuthTokenResponse>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn fetch_messages(&self, max_results: i32, query: Option<&str>) -> Result<Vec<GmailMessage>, reqwest::Error> {
        let url = format!("{}/messages", GMAIL_API_BASE);
        
        let mut params = vec![
            ("maxResults", max_results.to_string()),
        ];
        
        if let Some(q) = query {
            params.push(("q", q.to_string()));
        }
        
        let query_string = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        
        let response = self.client
            .get(format!("{}?{}", url, query_string))
            .header("Authorization", format!("Bearer {}", self.access_token))
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;
        
        let messages = response
            .get("messages")
            .and_then(|m| m.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|msg| {
                        Some(GmailMessage {
                            id: msg.get("id")?.as_str()?.to_string(),
                            thread_id: msg.get("threadId")?.as_str()?.to_string(),
                            label_ids: vec![], // Will be filled when fetching full message
                            snippet: String::new(),
                            payload: None,
                            internal_date: String::new(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        Ok(messages)
    }
    
    pub async fn fetch_message_detail(&self, message_id: &str) -> Result<GmailMessage, reqwest::Error> {
        let url = format!("{}/messages/{}", GMAIL_API_BASE, message_id);
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .send()
            .await?
            .json::<GmailMessage>()
            .await?;
        
        Ok(response)
    }
    
    pub fn extract_email_content(payload: &MessagePayload) -> String {
        let mut content = String::new();
        
        // Check if this is a multipart message
        if let Some(parts) = &payload.parts {
            for part in parts {
                if part.mime_type == "text/plain" || part.mime_type == "text/html" {
                    if let Some(data) = &part.body.data {
                        content.push_str(&Self::decode_base64(data));
                    }
                }
            }
        } else if let Some(body) = &payload.body {
            if let Some(data) = &body.data {
                content.push_str(&Self::decode_base64(data));
            }
        }
        
        content
    }
    
    fn decode_base64(data: &str) -> String {
        // Gmail uses URL-safe base64
        let normalized = data.replace('-', "+").replace('_', "/");
        
        match BASE64.decode(&normalized) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(_) => String::new(),
        }
    }
    
    pub fn extract_header_value(headers: &[MessageHeader], name: &str) -> Option<String> {
        headers
            .iter()
            .find(|h| h.name.to_lowercase() == name.to_lowercase())
            .map(|h| h.value.clone())
    }
}

// For browser-based email extraction (alternative approach)
pub struct BrowserEmailExtractor;

impl BrowserEmailExtractor {
    /// Extract email data from browser storage/cookies
    /// This requires browser extension or native messaging
    pub fn detect_browser_email_sources() -> Vec<EmailSource> {
        let mut sources = vec![];
        
        // Check for common browser email sources
        if Self::is_gmail_logged_in() {
            sources.push(EmailSource {
                name: "Gmail Web".to_string(),
                url: "https://mail.google.com".to_string(),
                method: ExtractionMethod::BrowserExtension,
            });
        }
        
        if Self::is_outlook_logged_in() {
            sources.push(EmailSource {
                name: "Outlook Web".to_string(),
                url: "https://outlook.live.com".to_string(),
                method: ExtractionMethod::BrowserExtension,
            });
        }
        
        sources
    }
    
    fn is_gmail_logged_in() -> bool {
        // Check for Gmail cookies/tokens
        // This would be implemented with browser extension
        false
    }
    
    fn is_outlook_logged_in() -> bool {
        // Check for Outlook cookies/tokens
        false
    }
}

#[derive(Debug)]
pub struct EmailSource {
    pub name: String,
    pub url: String,
    pub method: ExtractionMethod,
}

#[derive(Debug)]
pub enum ExtractionMethod {
    BrowserExtension,
    ApiOAuth,
    LocalDatabase,
}
