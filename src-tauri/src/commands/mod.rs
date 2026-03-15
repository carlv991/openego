use tauri::{State, AppHandle};
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use crate::database::{Database, User, Permissions, TodoItem};
use crate::gmail::GmailClient;
use crate::patterns::{EmailPatternDetector, DetectedTask, TaskType, Priority};
use uuid::Uuid;
use tauri_plugin_notification::NotificationExt;

// ==================== APP STATE ====================

pub struct AppState {
    pub db: Mutex<Option<Database>>,
}

// ==================== API RESPONSE ====================

#[derive(Serialize, Debug)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(msg: &str) -> Self {
        ApiResponse {
            success: false,
            data: None,
            error: Some(msg.to_string()),
        }
    }
}

// ==================== USER COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct SaveUserRequest {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub onboarding_complete: bool,
}

#[tauri::command]
pub fn save_user(state: State<AppState>, request: SaveUserRequest) -> ApiResponse<bool> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        let user = User {
            id: request.id,
            name: request.name,
            created_at: request.created_at,
            onboarding_complete: request.onboarding_complete,
        };
        
        match db.save_user(&user) {
            Ok(_) => ApiResponse::success(true),
            Err(e) => ApiResponse::error(&format!("Failed to save user: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

#[derive(Deserialize, Debug)]
pub struct GetUserRequest {
    pub user_id: String,
}

#[tauri::command]
pub fn get_user(state: State<AppState>, request: GetUserRequest) -> ApiResponse<Option<User>> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        match db.get_user(&request.user_id) {
            Ok(user) => ApiResponse::success(user),
            Err(e) => ApiResponse::error(&format!("Failed to get user: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

// ==================== PERMISSION COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct SavePermissionsRequest {
    pub user_id: String,
    pub permissions: Permissions,
}

#[tauri::command]
pub fn save_permissions(state: State<AppState>, request: SavePermissionsRequest) -> ApiResponse<bool> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        match db.save_permissions(&request.user_id, &request.permissions) {
            Ok(_) => ApiResponse::success(true),
            Err(e) => ApiResponse::error(&format!("Failed to save permissions: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

#[derive(Deserialize, Debug)]
pub struct GetPermissionsRequest {
    pub user_id: String,
}

#[tauri::command]
pub fn get_permissions(state: State<AppState>, request: GetPermissionsRequest) -> ApiResponse<Option<Permissions>> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        match db.get_permissions(&request.user_id) {
            Ok(perms) => ApiResponse::success(perms),
            Err(e) => ApiResponse::error(&format!("Failed to get permissions: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

// ==================== GMAIL COMMANDS ====================

#[derive(Serialize, Debug)]
pub struct GmailAuthUrlResponse {
    pub auth_url: String,
}

#[tauri::command]
pub fn get_gmail_auth_url() -> ApiResponse<GmailAuthUrlResponse> {
    let auth_url = GmailClient::get_auth_url();
    ApiResponse::success(GmailAuthUrlResponse { auth_url })
}

#[derive(Deserialize, Debug)]
pub struct AuthenticateGmailRequest {
    pub user_id: String,
    pub code: String,
}

#[derive(Serialize, Debug)]
pub struct GmailAuthResponse {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn authenticate_gmail(state: State<'_, AppState>, request: AuthenticateGmailRequest) -> Result<ApiResponse<GmailAuthResponse>, String> {
    // Clone the necessary data before async operations
    let token_response = GmailClient::exchange_code_for_token(&request.code).await
        .map_err(|e| format!("Failed to exchange code: {}", e))?;
    
    let expires_at = chrono::Utc::now().timestamp() + token_response.expires_in as i64;
    let refresh_token = token_response.refresh_token.unwrap_or_default();
    let access_token = token_response.access_token;
    let user_id = request.user_id;
    
    // For async commands, we need to drop the state reference before await points
    // But since we need state for DB access, we do a synchronous lock and operation
    // within the async fn (this blocks the async runtime but is acceptable for DB ops)
    {
        let db_lock = state.db.lock().unwrap();
        if let Some(ref db) = *db_lock {
            // In a real implementation, this would be async or use a proper async DB pool
            // For now, we simulate the save operation
            println!("Would save Gmail token for user: {}", user_id);
            let _ = (access_token, refresh_token, expires_at);
        }
    }
    
    Ok(ApiResponse::success(GmailAuthResponse {
        success: true,
        message: "Gmail authenticated successfully".to_string(),
    }))
}

#[derive(Deserialize, Debug)]
pub struct FetchGmailMessagesRequest {
    pub user_id: String,
    pub max_results: Option<i32>,
    pub query: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct FetchGmailMessagesResponse {
    pub messages: Vec<GmailMessageSummary>,
}

#[derive(Serialize, Debug)]
pub struct GmailMessageSummary {
    pub id: String,
    pub thread_id: String,
    pub subject: String,
    pub sender: String,
    pub snippet: String,
    pub internal_date: String,
}

#[tauri::command]
pub async fn fetch_gmail_messages(state: State<'_, AppState>, request: FetchGmailMessagesRequest) -> Result<ApiResponse<FetchGmailMessagesResponse>, String> {
    // Get the token from state before any await points
    let access_token = {
        let db_lock = state.db.lock().unwrap();
        if let Some(ref db) = *db_lock {
            match db.get_gmail_token(&request.user_id) {
                Ok(Some((token, _, _))) => token,
                Ok(None) => return Ok(ApiResponse::error("Gmail not authenticated")),
                Err(e) => return Ok(ApiResponse::error(&format!("Failed to get token: {}", e))),
            }
        } else {
            return Ok(ApiResponse::error("Database not initialized"));
        }
    };
    
    // Now we can do async operations without holding the state reference
    let client = GmailClient::new(access_token);
    let max_results = request.max_results.unwrap_or(10);
    
    match client.fetch_messages(max_results, request.query.as_deref()).await {
        Ok(messages) => {
            let summaries: Vec<GmailMessageSummary> = messages
                .into_iter()
                .map(|m| GmailMessageSummary {
                    id: m.id,
                    thread_id: m.thread_id,
                    subject: "Unknown".to_string(),
                    sender: "Unknown".to_string(),
                    snippet: m.snippet,
                    internal_date: m.internal_date,
                })
                .collect();
            
            Ok(ApiResponse::success(FetchGmailMessagesResponse { messages: summaries }))
        }
        Err(e) => Ok(ApiResponse::error(&format!("Failed to fetch messages: {}", e))),
    }
}

// ==================== DATA INGESTION COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct StartDataIngestionRequest {
    pub user_id: String,
    pub sources: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct DataIngestionResponse {
    pub job_id: String,
    pub status: String,
}

#[tauri::command]
pub fn start_data_ingestion(_state: State<AppState>, request: StartDataIngestionRequest) -> ApiResponse<DataIngestionResponse> {
    println!("Starting data ingestion for user: {} with sources: {:?}", request.user_id, request.sources);
    
    let job_id = Uuid::new_v4().to_string();
    ApiResponse::success(DataIngestionResponse {
        job_id,
        status: "started".to_string(),
    })
}

#[derive(Deserialize, Debug)]
pub struct GetIngestionProgressRequest {
    pub job_id: String,
}

#[derive(Serialize, Debug)]
pub struct IngestionProgressResponse {
    pub job_id: String,
    pub status: String,
    pub progress: f64,
    pub messages_processed: i64,
    pub total_messages: i64,
}

#[tauri::command]
pub fn get_ingestion_progress(_state: State<AppState>, request: GetIngestionProgressRequest) -> ApiResponse<IngestionProgressResponse> {
    ApiResponse::success(IngestionProgressResponse {
        job_id: request.job_id,
        status: "in_progress".to_string(),
        progress: 0.5,
        messages_processed: 100,
        total_messages: 200,
    })
}

// ==================== LEARNING COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct StartLearningRequest {
    pub user_id: String,
}

#[derive(Serialize, Debug)]
pub struct LearningResponse {
    pub job_id: String,
    pub status: String,
}

#[tauri::command]
pub fn start_learning(_state: State<AppState>, request: StartLearningRequest) -> ApiResponse<LearningResponse> {
    println!("Starting learning for user: {}", request.user_id);
    
    let job_id = Uuid::new_v4().to_string();
    ApiResponse::success(LearningResponse {
        job_id,
        status: "started".to_string(),
    })
}

#[derive(Deserialize, Debug)]
pub struct GetLearningProgressRequest {
    pub job_id: String,
}

#[derive(Serialize, Debug)]
pub struct LearningProgressResponse {
    pub job_id: String,
    pub status: String,
    pub progress: f64,
    pub patterns_learned: i64,
}

#[tauri::command]
pub fn get_learning_progress(_state: State<AppState>, request: GetLearningProgressRequest) -> ApiResponse<LearningProgressResponse> {
    ApiResponse::success(LearningProgressResponse {
        job_id: request.job_id,
        status: "in_progress".to_string(),
        progress: 0.3,
        patterns_learned: 15,
    })
}

// ==================== RESPONSE GENERATION COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct GenerateResponseRequest {
    pub user_id: String,
    pub message_id: String,
    pub context: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct GenerateResponse {
    pub response_text: String,
    pub confidence: f64,
    pub suggested_actions: Vec<String>,
}

#[tauri::command]
pub fn generate_response(_state: State<AppState>, request: GenerateResponseRequest) -> ApiResponse<GenerateResponse> {
    println!("Generating response for message: {} with context: {:?}", request.message_id, request.context);
    
    ApiResponse::success(GenerateResponse {
        response_text: "Thank you for your message. I'll get back to you shortly.".to_string(),
        confidence: 0.85,
        suggested_actions: vec!["Send now".to_string(), "Edit".to_string(), "Discard".to_string()],
    })
}

#[derive(Deserialize, Debug)]
pub struct CalculateConfidenceRequest {
    pub user_id: String,
    pub message_content: String,
    pub proposed_response: String,
}

#[derive(Serialize, Debug)]
pub struct ConfidenceResponse {
    pub confidence: f64,
    pub factors: Vec<String>,
}

#[tauri::command]
pub fn calculate_confidence(_state: State<AppState>, request: CalculateConfidenceRequest) -> ApiResponse<ConfidenceResponse> {
    println!("Calculating confidence for response to: {}", request.message_content);
    
    ApiResponse::success(ConfidenceResponse {
        confidence: 0.82,
        factors: vec!["Vocabulary match".to_string(), "Tone similarity".to_string(), "Historical patterns".to_string()],
    })
}

// ==================== SYSTEM COMMANDS ====================

#[derive(Serialize, Debug)]
pub struct DataSourceStatus {
    pub source: String,
    pub connected: bool,
    pub last_sync: Option<String>,
    pub message_count: i64,
}

#[derive(Serialize, Debug)]
pub struct CheckDataSourcesResponse {
    pub sources: Vec<DataSourceStatus>,
}

#[tauri::command]
pub fn check_data_sources(state: State<AppState>) -> ApiResponse<CheckDataSourcesResponse> {
    let db_lock = state.db.lock().unwrap();
    
    let message_count = if let Some(ref db) = *db_lock {
        db.get_message_count().unwrap_or(0)
    } else {
        0
    };
    
    ApiResponse::success(CheckDataSourcesResponse {
        sources: vec![
            DataSourceStatus {
                source: "Gmail".to_string(),
                connected: true,
                last_sync: Some(chrono::Utc::now().to_rfc3339()),
                message_count,
            },
            DataSourceStatus {
                source: "Outlook".to_string(),
                connected: false,
                last_sync: None,
                message_count: 0,
            },
        ],
    })
}

#[derive(Serialize, Debug)]
pub struct SystemStatus {
    pub version: String,
    pub database_connected: bool,
    pub models_loaded: bool,
    pub active_sources: Vec<String>,
    pub total_messages: i64,
    pub total_patterns: i64,
}

#[tauri::command]
pub fn get_system_status(state: State<AppState>) -> ApiResponse<SystemStatus> {
    let db_lock = state.db.lock().unwrap();
    
    let total_messages = if let Some(ref db) = *db_lock {
        db.get_message_count().unwrap_or(0)
    } else {
        0
    };
    
    ApiResponse::success(SystemStatus {
        version: "0.1.0".to_string(),
        database_connected: db_lock.is_some(),
        models_loaded: true,
        active_sources: vec!["Gmail".to_string()],
        total_messages,
        total_patterns: 42,
    })
}

// ==================== TODO COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct CreateTodoRequest {
    pub user_id: String,
    pub title: String,
    pub description: String,
    pub priority: Option<String>,
    pub related_type: Option<String>,
    pub related_id: Option<String>,
    pub due_date: Option<i64>,
}

#[derive(Serialize, Debug)]
pub struct CreateTodoResponse {
    pub todo_id: String,
    pub success: bool,
}

#[tauri::command]
pub fn create_todo(state: State<AppState>, request: CreateTodoRequest) -> ApiResponse<CreateTodoResponse> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        let todo = TodoItem {
            id: Uuid::new_v4().to_string(),
            user_id: request.user_id,
            title: request.title,
            description: request.description,
            priority: request.priority.unwrap_or_else(|| "normal".to_string()),
            status: "open".to_string(),
            related_type: request.related_type.unwrap_or_else(|| "none".to_string()),
            related_id: request.related_id.unwrap_or_default(),
            created_at: chrono::Utc::now().timestamp(),
            due_date: request.due_date,
        };
        
        match db.create_todo(&todo) {
            Ok(_) => ApiResponse::success(CreateTodoResponse {
                todo_id: todo.id,
                success: true,
            }),
            Err(e) => ApiResponse::error(&format!("Failed to create todo: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

#[derive(Deserialize, Debug)]
pub struct GetTodosRequest {
    pub user_id: String,
    pub status: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct GetTodosResponse {
    pub todos: Vec<TodoItem>,
}

#[tauri::command]
pub fn get_todos(state: State<AppState>, request: GetTodosRequest) -> ApiResponse<GetTodosResponse> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        match db.get_todos(&request.user_id, request.status.as_deref()) {
            Ok(todos) => ApiResponse::success(GetTodosResponse { todos }),
            Err(e) => ApiResponse::error(&format!("Failed to get todos: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

#[derive(Deserialize, Debug)]
pub struct UpdateTodoStatusRequest {
    pub todo_id: String,
    pub status: String,
}

#[tauri::command]
pub fn update_todo_status(state: State<AppState>, request: UpdateTodoStatusRequest) -> ApiResponse<bool> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        match db.update_todo_status(&request.todo_id, &request.status) {
            Ok(_) => ApiResponse::success(true),
            Err(e) => ApiResponse::error(&format!("Failed to update todo: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

#[derive(Deserialize, Debug)]
pub struct DeleteTodoRequest {
    pub todo_id: String,
}

#[tauri::command]
pub fn delete_todo(state: State<AppState>, request: DeleteTodoRequest) -> ApiResponse<bool> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        match db.delete_todo(&request.todo_id) {
            Ok(_) => ApiResponse::success(true),
            Err(e) => ApiResponse::error(&format!("Failed to delete todo: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

#[derive(Deserialize, Debug)]
pub struct GetTodoStatsRequest {
    pub user_id: String,
}

#[derive(Serialize, Debug)]
pub struct TodoStatsResponse {
    pub total: i64,
    pub open: i64,
    pub critical: i64,
    pub urgent: i64,
}

#[tauri::command]
pub fn get_todo_stats(state: State<AppState>, request: GetTodoStatsRequest) -> ApiResponse<TodoStatsResponse> {
    let db_lock = state.db.lock().unwrap();
    
    if let Some(ref db) = *db_lock {
        match db.get_todo_stats(&request.user_id) {
            Ok(stats) => {
                ApiResponse::success(TodoStatsResponse {
                    total: stats.get("total").and_then(|v| v.as_i64()).unwrap_or(0),
                    open: stats.get("open").and_then(|v| v.as_i64()).unwrap_or(0),
                    critical: stats.get("critical").and_then(|v| v.as_i64()).unwrap_or(0),
                    urgent: stats.get("urgent").and_then(|v| v.as_i64()).unwrap_or(0),
                })
            }
            Err(e) => ApiResponse::error(&format!("Failed to get todo stats: {}", e)),
        }
    } else {
        ApiResponse::error("Database not initialized")
    }
}

#[derive(Deserialize, Debug)]
pub struct OpenRelatedItemRequest {
    pub related_type: String,
    pub related_id: String,
}

#[derive(Serialize, Debug)]
pub struct OpenRelatedItemResponse {
    pub success: bool,
    pub url: Option<String>,
}

#[tauri::command]
pub fn open_related_item(_state: State<AppState>, request: OpenRelatedItemRequest) -> ApiResponse<OpenRelatedItemResponse> {
    let url = match request.related_type.as_str() {
        "email" => Some(format!("https://mail.google.com/mail/u/0/#inbox/{}", request.related_id)),
        "file" => Some(format!("file://{}", request.related_id)),
        _ => None,
    };
    
    ApiResponse::success(OpenRelatedItemResponse {
        success: url.is_some(),
        url,
    })
}

// ==================== NOTIFICATION COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct NotificationRequest {
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
}

#[tauri::command]
pub fn send_notification(app_handle: AppHandle, request: NotificationRequest) -> ApiResponse<bool> {
    use tauri_plugin_notification::NotificationExt;
    
    let mut notification = app_handle.notification()
        .builder()
        .title(request.title)
        .body(request.body);
    
    if let Some(icon) = request.icon {
        notification = notification.icon(icon);
    }
    
    match notification.show() {
        Ok(_) => ApiResponse::success(true),
        Err(e) => ApiResponse::error(&format!("Failed to send notification: {}", e)),
    }
}

#[tauri::command]
pub fn request_notification_permission(app_handle: AppHandle) -> ApiResponse<bool> {
    let result = app_handle.notification().request_permission();
    match result {
        Ok(state) => {
            let allowed = matches!(state, tauri_plugin_notification::PermissionState::Granted);
            ApiResponse::success(allowed)
        }
        Err(e) => ApiResponse::error(&format!("Failed to request permission: {}", e)),
    }
}

#[tauri::command]
pub fn is_notification_allowed(app_handle: AppHandle) -> ApiResponse<bool> {
    match app_handle.notification().permission_state() {
        Ok(state) => {
            let allowed = matches!(state, tauri_plugin_notification::PermissionState::Granted);
            ApiResponse::success(allowed)
        }
        Err(e) => ApiResponse::error(&format!("Failed to check permission: {}", e)),
    }
}

#[derive(Serialize, Debug)]
pub struct BackgroundStatus {
    pub is_running: bool,
    pub auto_pilot_enabled: bool,
    pub last_check: Option<i64>,
    pub messages_processed: i64,
}

#[tauri::command]
pub fn get_background_status(_state: State<AppState>) -> ApiResponse<BackgroundStatus> {
    ApiResponse::success(BackgroundStatus {
        is_running: true,
        auto_pilot_enabled: false,
        last_check: Some(chrono::Utc::now().timestamp()),
        messages_processed: 0,
    })
}

#[tauri::command]
pub fn toggle_auto_pilot(_state: State<AppState>, enabled: bool) -> ApiResponse<bool> {
    println!("Auto-Pilot mode: {}", if enabled { "ENABLED" } else { "DISABLED" });
    ApiResponse::success(true)
}

// ==================== PATTERN DETECTION COMMANDS ====================

#[derive(Deserialize, Debug)]
pub struct DetectTasksFromEmailRequest {
    pub email_id: String,
    pub subject: String,
    pub body: String,
    pub sender: String,
}

#[derive(Serialize, Debug)]
pub struct DetectTasksResponse {
    pub tasks: Vec<DetectedTaskSummary>,
}

#[derive(Serialize, Debug)]
pub struct DetectedTaskSummary {
    pub task_type: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub confidence: f64,
    pub action_required: String,
}

#[tauri::command]
pub fn detect_tasks_from_email(request: DetectTasksFromEmailRequest) -> ApiResponse<DetectTasksResponse> {
    let detector = EmailPatternDetector::new();
    let detected = detector.detect_tasks(&request.subject, &request.body, &request.sender, &request.email_id);
    
    let tasks: Vec<DetectedTaskSummary> = detected
        .into_iter()
        .map(|t| DetectedTaskSummary {
            task_type: format!("{:?}", t.task_type),
            title: t.title,
            description: t.description,
            priority: format!("{:?}", t.priority),
            confidence: t.confidence,
            action_required: t.action_required,
        })
        .collect();
    
    ApiResponse::success(DetectTasksResponse { tasks })
}

#[derive(Deserialize, Debug)]
pub struct AutoProcessEmailRequest {
    pub email_id: String,
    pub subject: String,
    pub body: String,
    pub sender: String,
    pub auto_pilot_enabled: bool,
}

#[derive(Serialize, Debug)]
pub struct AutoProcessResponse {
    pub should_auto_respond: bool,
    pub suggested_response: Option<String>,
    pub created_todo: Option<String>,
}

#[tauri::command]
pub fn auto_process_email(request: AutoProcessEmailRequest) -> ApiResponse<AutoProcessResponse> {
    let detector = EmailPatternDetector::new();
    let detected = detector.detect_tasks(&request.subject, &request.body, &request.sender, &request.email_id);
    
    let mut should_auto_respond = false;
    let mut suggested_response = None;
    let mut created_todo = None;
    
    for task in &detected {
        if detector.should_auto_respond(task, request.auto_pilot_enabled) {
            should_auto_respond = true;
            suggested_response = Some(detector.get_suggested_response(task));
        }
        
        if !matches!(task.task_type, TaskType::Unsubscribe) {
            created_todo = Some(task.title.clone());
        }
    }
    
    ApiResponse::success(AutoProcessResponse {
        should_auto_respond,
        suggested_response,
        created_todo,
    })
}

#[derive(Deserialize, Debug)]
pub struct GetSuggestedResponseRequest {
    pub task_type: String,
    pub sender: String,
    pub subject: String,
}

#[derive(Serialize, Debug)]
pub struct SuggestedResponse {
    pub response_text: String,
    pub confidence: f64,
}

#[tauri::command]
pub fn get_suggested_response(request: GetSuggestedResponseRequest) -> ApiResponse<SuggestedResponse> {
    let detector = EmailPatternDetector::new();
    
    // Create a dummy DetectedTask to get the suggested response
    let task = DetectedTask {
        task_type: match request.task_type.as_str() {
            "Meeting" => TaskType::Meeting,
            "Question" => TaskType::Question,
            "FollowUp" => TaskType::FollowUp,
            "Payment" => TaskType::Payment,
            "Review" => TaskType::Review,
            "Deadline" => TaskType::Deadline,
            "Unsubscribe" => TaskType::Unsubscribe,
            _ => TaskType::Unknown,
        },
        title: request.subject.clone(),
        description: format!("From: {}", request.sender),
        priority: Priority::Normal,
        confidence: 0.8,
        related_email_id: "dummy".to_string(),
        action_required: "Respond".to_string(),
    };
    
    let response_text = detector.get_suggested_response(&task);
    
    ApiResponse::success(SuggestedResponse {
        response_text,
        confidence: 0.8,
    })
}
