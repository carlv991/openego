use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub onboarding_complete: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Permissions {
    pub gmail: bool,
    pub outlook: bool,
    pub apple_mail: bool,
    pub telegram: bool,
    pub slack: bool,
    pub documents: bool,
    pub calendar: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub platform: String,
    pub thread_id: String,
    pub sender: String,
    pub recipient: String,
    pub content: String,
    pub timestamp: i64,
    pub processed: bool,
    pub embedding_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserPattern {
    pub id: String,
    pub pattern_type: String, // 'vocabulary', 'timing', 'tone'
    pub pattern_data: serde_json::Value,
    pub confidence: f64,
    pub last_updated: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionLog {
    pub id: String,
    pub timestamp: i64,
    pub action_type: String, // 'suggested', 'sent', 'blocked'
    pub platform: String,
    pub confidence: f64,
    pub content_preview: String,
    pub full_content: String, // encrypted
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub description: String,
    pub priority: String, // 'normal', 'urgent', 'critical'
    pub status: String,   // 'open', 'in_progress', 'done'
    pub related_type: String, // 'email', 'file', 'none'
    pub related_id: String,   // email ID or file path
    pub created_at: i64,
    pub due_date: Option<i64>,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_dir = app_handle.path().app_data_dir()
            .expect("Failed to get app data directory");
        
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1), // SQLITE_ERROR
                Some(format!("Failed to create directory: {}", e))
            ))?;
        
        let db_path = app_dir.join("aiself.db");
        let conn = Connection::open(db_path)?;
        
        let db = Database { conn };
        db.init_tables()?;
        
        Ok(db)
    }
    
    fn init_tables(&self) -> Result<()> {
        // Users table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                onboarding_complete BOOLEAN DEFAULT 0,
                selected_model TEXT DEFAULT 'llama3'
            )",
            [],
        )?;
        
        // Permissions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS permissions (
                user_id TEXT PRIMARY KEY,
                gmail BOOLEAN DEFAULT 0,
                outlook BOOLEAN DEFAULT 0,
                apple_mail BOOLEAN DEFAULT 0,
                telegram BOOLEAN DEFAULT 0,
                slack BOOLEAN DEFAULT 0,
                documents BOOLEAN DEFAULT 0,
                calendar BOOLEAN DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            [],
        )?;
        
        // Messages table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                thread_id TEXT,
                sender TEXT,
                recipient TEXT,
                content TEXT,
                timestamp INTEGER,
                processed BOOLEAN DEFAULT 0,
                embedding_id TEXT
            )",
            [],
        )?;
        
        // User patterns table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS user_patterns (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                pattern_type TEXT NOT NULL,
                pattern_data TEXT NOT NULL,
                confidence REAL DEFAULT 0.0,
                last_updated INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            [],
        )?;
        
        // Action log table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS action_log (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                platform TEXT,
                confidence REAL,
                content_preview TEXT,
                full_content TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            [],
        )?;
        
        // Todo items table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS todo_items (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                priority TEXT DEFAULT 'normal',
                status TEXT DEFAULT 'open',
                related_type TEXT DEFAULT 'none',
                related_id TEXT,
                created_at INTEGER NOT NULL,
                due_date INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            [],
        )?;
        
        // Gmail tokens table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS gmail_tokens (
                user_id TEXT PRIMARY KEY,
                access_token TEXT,
                refresh_token TEXT,
                expires_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            [],
        )?;
        
        // Create indexes
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages(platform)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_todo_user ON todo_items(user_id)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_todo_priority ON todo_items(priority)",
            [],
        )?;
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_todo_status ON todo_items(status)",
            [],
        )?;
        
        Ok(())
    }
    
    // User operations
    pub fn save_user(&self, user: &User) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO users (id, name, created_at, onboarding_complete) 
             VALUES (?1, ?2, ?3, ?4)",
            (&user.id, &user.name, &user.created_at, &user.onboarding_complete),
        )?;
        Ok(())
    }
    
    pub fn get_user(&self, user_id: &str) -> Result<Option<User>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, created_at, onboarding_complete FROM users WHERE id = ?1"
        )?;
        
        let user = stmt.query_row([user_id], |row| {
            Ok(User {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                onboarding_complete: row.get(3)?,
            })
        });
        
        match user {
            Ok(u) => Ok(Some(u)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
    
    // Permissions operations
    pub fn save_permissions(&self, user_id: &str, perms: &Permissions) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO permissions 
             (user_id, gmail, outlook, apple_mail, telegram, slack, documents, calendar)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                user_id,
                perms.gmail,
                perms.outlook,
                perms.apple_mail,
                perms.telegram,
                perms.slack,
                perms.documents,
                perms.calendar,
            ),
        )?;
        Ok(())
    }
    
    pub fn get_permissions(&self, user_id: &str) -> Result<Option<Permissions>> {
        let mut stmt = self.conn.prepare(
            "SELECT gmail, outlook, apple_mail, telegram, slack, documents, calendar 
             FROM permissions WHERE user_id = ?1"
        )?;
        
        let perms = stmt.query_row([user_id], |row| {
            Ok(Permissions {
                gmail: row.get(0)?,
                outlook: row.get(1)?,
                apple_mail: row.get(2)?,
                telegram: row.get(3)?,
                slack: row.get(4)?,
                documents: row.get(5)?,
                calendar: row.get(6)?,
            })
        });
        
        match perms {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
    
    // Message operations
    pub fn save_message(&self, msg: &Message) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO messages 
             (id, platform, thread_id, sender, recipient, content, timestamp, processed, embedding_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (
                &msg.id,
                &msg.platform,
                &msg.thread_id,
                &msg.sender,
                &msg.recipient,
                &msg.content,
                msg.timestamp,
                msg.processed,
                &msg.embedding_id,
            ),
        )?;
        Ok(())
    }
    
    pub fn get_unprocessed_messages(&self, limit: i64) -> Result<Vec<Message>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, platform, thread_id, sender, recipient, content, timestamp, processed, embedding_id
             FROM messages WHERE processed = 0 LIMIT ?1"
        )?;
        
        let messages = stmt.query_map([limit], |row| {
            Ok(Message {
                id: row.get(0)?,
                platform: row.get(1)?,
                thread_id: row.get(2)?,
                sender: row.get(3)?,
                recipient: row.get(4)?,
                content: row.get(5)?,
                timestamp: row.get(6)?,
                processed: row.get(7)?,
                embedding_id: row.get(8)?,
            })
        })?;
        
        messages.collect()
    }
    
    pub fn mark_message_processed(&self, msg_id: &str, embedding_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET processed = 1, embedding_id = ?1 WHERE id = ?2",
            [embedding_id, msg_id],
        )?;
        Ok(())
    }
    
    pub fn get_message_count(&self) -> Result<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM messages",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }
    
    pub fn get_message_stats(&self) -> Result<serde_json::Value> {
        let total: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM messages", [], |row| row.get(0)
        )?;
        
        let processed: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE processed = 1", [], |row| row.get(0)
        )?;
        
        let mut stmt = self.conn.prepare(
            "SELECT platform, COUNT(*) FROM messages GROUP BY platform"
        )?;
        
        let platform_counts: Vec<(String, i64)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?.collect::<Result<Vec<_>>>()?;
        
        Ok(serde_json::json!({
            "total": total,
            "processed": processed,
            "unprocessed": total - processed,
            "by_platform": platform_counts,
        }))
    }
    
    // Gmail token operations
    pub fn save_gmail_token(&self, user_id: &str, access_token: &str, refresh_token: &str, expires_at: i64) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO gmail_tokens (user_id, access_token, refresh_token, expires_at)
             VALUES (?1, ?2, ?3, ?4)",
            [user_id, access_token, refresh_token, expires_at.to_string().as_str()],
        )?;
        Ok(())
    }
    
    pub fn get_gmail_token(&self, user_id: &str) -> Result<Option<(String, String, i64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT access_token, refresh_token, expires_at FROM gmail_tokens WHERE user_id = ?1"
        )?;
        
        let token = stmt.query_row([user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        });
        
        match token {
            Ok(t) => Ok(Some(t)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
    
    // Todo item operations
    pub fn create_todo(&self, todo: &TodoItem) -> Result<()> {
        self.conn.execute(
            "INSERT INTO todo_items 
             (id, user_id, title, description, priority, status, related_type, related_id, created_at, due_date)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            (
                &todo.id,
                &todo.user_id,
                &todo.title,
                &todo.description,
                &todo.priority,
                &todo.status,
                &todo.related_type,
                &todo.related_id,
                todo.created_at,
                todo.due_date,
            ),
        )?;
        Ok(())
    }
    
    pub fn get_todos(&self, user_id: &str, status: Option<&str>) -> Result<Vec<TodoItem>> {
        let sql = if let Some(s) = status {
            "SELECT id, user_id, title, description, priority, status, related_type, related_id, created_at, due_date
             FROM todo_items WHERE user_id = ?1 AND status = ?2 ORDER BY 
             CASE priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, created_at DESC"
        } else {
            "SELECT id, user_id, title, description, priority, status, related_type, related_id, created_at, due_date
             FROM todo_items WHERE user_id = ?1 ORDER BY 
             CASE priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, created_at DESC"
        };
        
        let mut stmt = self.conn.prepare(sql)?;
        
        let todos = if let Some(s) = status {
            stmt.query_map([user_id, s], |row| {
                Ok(TodoItem {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    priority: row.get(4)?,
                    status: row.get(5)?,
                    related_type: row.get(6)?,
                    related_id: row.get(7)?,
                    created_at: row.get(8)?,
                    due_date: row.get(9)?,
                })
            })?.collect::<Result<Vec<_>>>()?
        } else {
            stmt.query_map([user_id], |row| {
                Ok(TodoItem {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    priority: row.get(4)?,
                    status: row.get(5)?,
                    related_type: row.get(6)?,
                    related_id: row.get(7)?,
                    created_at: row.get(8)?,
                    due_date: row.get(9)?,
                })
            })?.collect::<Result<Vec<_>>>()?
        };
        
        Ok(todos)
    }
    
    pub fn update_todo_status(&self, todo_id: &str, status: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE todo_items SET status = ?1 WHERE id = ?2",
            [status, todo_id],
        )?;
        Ok(())
    }
    
    pub fn delete_todo(&self, todo_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM todo_items WHERE id = ?1",
            [todo_id],
        )?;
        Ok(())
    }
    
    pub fn get_todo_stats(&self, user_id: &str) -> Result<serde_json::Value> {
        let total: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todo_items WHERE user_id = ?1",
            [user_id],
            |row| row.get(0),
        )?;
        
        let open: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todo_items WHERE user_id = ?1 AND status = 'open'",
            [user_id],
            |row| row.get(0),
        )?;
        
        let critical: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todo_items WHERE user_id = ?1 AND priority = 'critical' AND status != 'done'",
            [user_id],
            |row| row.get(0),
        )?;
        
        let urgent: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todo_items WHERE user_id = ?1 AND priority = 'urgent' AND status != 'done'",
            [user_id],
            |row| row.get(0),
        )?;
        
        Ok(serde_json::json!({
            "total": total,
            "open": open,
            "critical": critical,
            "urgent": urgent,
        }))
    }
}

pub fn init_database(app_handle: AppHandle) -> Result<()> {
    let _db = Database::new(&app_handle)?;
    println!("✅ Database initialized successfully");
    Ok(())
}
