use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use crate::database::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionInfo {
    pub version: String,
    pub notes: String,
    pub released_at: u64,
    pub download_url: String,
    pub mandatory: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateCheck {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub version_info: Option<VersionInfo>,
    pub skipped_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSettings {
    pub auto_check: bool,
    pub auto_download: bool,
    pub check_interval_hours: u32,
    pub last_check: Option<u64>,
    pub skipped_version: Option<String>,
}

pub struct Updater {
    app_handle: AppHandle,
    current_version: String,
    update_url: String,
}

impl Updater {
    pub fn new(app_handle: AppHandle) -> Self {
        let current_version = env!("CARGO_PKG_VERSION").to_string();
        let update_url = "https://openego.ai/version.json".to_string();
        
        Updater {
            app_handle,
            current_version,
            update_url,
        }
    }
    
    /// Check for updates from the server
    pub async fn check_for_updates(&self) -> Result<UpdateCheck, String> {
        // Fetch version info from server
        let response = reqwest::get(&self.update_url)
            .await
            .map_err(|e| format!("Failed to fetch version info: {}", e))?;
        
        if !response.status().is_success() {
            return Err("Failed to fetch version info".to_string());
        }
        
        let version_info: VersionInfo = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse version info: {}", e))?;
        
        // Compare versions
        let has_update = self.is_newer_version(&version_info.version, &self.current_version);
        
        // Get user settings
        let skipped_version = self.get_skipped_version().await?;
        
        // Check if user skipped this version
        let has_update = has_update && Some(&version_info.version) != skipped_version.as_ref();
        
        // Generate download URL based on platform
        let download_url = self.generate_download_url(&version_info.version);
        
        Ok(UpdateCheck {
            has_update,
            current_version: self.current_version.clone(),
            latest_version: version_info.version.clone(),
            version_info: Some(VersionInfo {
                download_url,
                ..version_info
            }),
            skipped_version,
        })
    }
    
    /// Compare semantic versions
    /// Returns true if remote > current
    fn is_newer_version(&self, remote: &str, current: &str) -> bool {
        let remote_parts: Vec<u32> = remote
            .trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect();
        
        let current_parts: Vec<u32> = current
            .trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect();
        
        for (r, c) in remote_parts.iter().zip(current_parts.iter()) {
            match r.cmp(c) {
                std::cmp::Ordering::Greater => return true,
                std::cmp::Ordering::Less => return false,
                std::cmp::Ordering::Equal => continue,
            }
        }
        
        remote_parts.len() > current_parts.len()
    }
    
    /// Generate download URL based on platform and architecture
    fn generate_download_url(&self, version: &str) -> String {
        let os = std::env::consts::OS;
        let arch = std::env::consts::ARCH;
        
        let platform = match (os, arch) {
            ("linux", "x86_64") => "linux-x86_64",
            ("linux", "aarch64") => "linux-aarch64",
            ("macos", "x86_64") => "macos-x86_64",
            ("macos", "aarch64") => "macos-aarch64",
            ("windows", "x86_64") => "windows-x86_64",
            ("windows", "x86") => "windows-x86",
            _ => "unknown",
        };
        
        format!(
            "https://github.com/carlv991/openego/releases/download/v{}/openego-{}.tar.gz",
            version, platform
        )
    }
    
    /// Skip this version (don't remind again)
    pub async fn skip_version(&self, version: &str) -> Result<(), String> {
        let state: tauri::State<crate::commands::AppState> = self.app_handle.state();
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        
        if let Some(ref db) = *db_lock {
            // Save to database
            db.save_setting("update_skipped_version", version)
                .map_err(|e| e.to_string())?;
        }
        
        Ok(())
    }
    
    /// Get skipped version from settings
    async fn get_skipped_version(&self) -> Result<Option<String>, String> {
        let state: tauri::State<crate::commands::AppState> = self.app_handle.state();
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        
        if let Some(ref db) = *db_lock {
            db.get_setting("update_skipped_version")
                .map_err(|e| e.to_string())
        } else {
            Ok(None)
        }
    }
    
    /// Download and install update
    pub async fn download_and_install(&self, version_info: &VersionInfo) -> Result<(), String> {
        let download_path = self.app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("update.tar.gz");
        
        // Download update
        let response = reqwest::get(&version_info.download_url)
            .await
            .map_err(|e| format!("Download failed: {}", e))?;
        
        if !response.status().is_success() {
            return Err("Download failed: Server returned error".to_string());
        }
        
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to download: {}", e))?;
        
        // Save to temp file
        std::fs::write(&download_path, bytes)
            .map_err(|e| format!("Failed to save update: {}", e))?;
        
        // Extract and install (platform-specific)
        self.install_update(&download_path).await?;
        
        Ok(())
    }
    
    /// Platform-specific installation
    async fn install_update(&self, update_path: &std::path::Path) -> Result<(), String> {
        let os = std::env::consts::OS;
        
        match os {
            "macos" | "linux" => {
                // Extract tar.gz
                let output = std::process::Command::new("tar")
                    .args(&["-xzf", update_path.to_str().unwrap(), "-C", "/tmp"])
                    .output()
                    .map_err(|e| format!("Extraction failed: {}", e))?;
                
                if !output.status.success() {
                    return Err("Failed to extract update".to_string());
                }
                
                // Replace current binary
                let current_exe = std::env::current_exe()
                    .map_err(|e| format!("Failed to get current exe: {}", e))?;
                
                let new_binary = std::path::Path::new("/tmp/openego");
                
                // On macOS/Linux, we need to use a helper script to replace the binary
                // because we can't replace a running binary on Unix
                let script = format!(
                    r#"#!/bin/bash
                    sleep 2
                    cp "{}" "{}"
                    chmod +x "{}"
                    rm "{}"
                    open "{}"
                    "#,
                    new_binary.display(),
                    current_exe.display(),
                    current_exe.display(),
                    update_path.display(),
                    current_exe.display()
                );
                
                let script_path = std::path::Path::new("/tmp/openego_update.sh");
                std::fs::write(script_path, script)
                    .map_err(|e| format!("Failed to write update script: {}", e))?;
                
                std::process::Command::new("chmod")
                    .args(&["+x", script_path.to_str().unwrap()])
                    .output()
                    .ok();
                
                // Run script in background
                std::process::Command::new("bash")
                    .arg(script_path)
                    .spawn()
                    .map_err(|e| format!("Failed to run update script: {}", e))?;
                
                // Exit current app
                std::process::exit(0);
            }
            "windows" => {
                // Windows allows renaming a running executable
                let current_exe = std::env::current_exe()
                    .map_err(|e| format!("Failed to get current exe: {}", e))?;
                
                let old_exe = current_exe.with_extension("exe.old");
                
                // Rename current exe
                std::fs::rename(&current_exe, &old_exe)
                    .map_err(|e| format!("Failed to rename current exe: {}", e))?;
                
                // Extract new exe
                let output = std::process::Command::new("powershell")
                    .args(&[
                        "-Command",
                        &format!(
                            "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                            update_path.display(),
                            current_exe.parent().unwrap().display()
                        ),
                    ])
                    .output()
                    .map_err(|e| format!("Extraction failed: {}", e))?;
                
                if !output.status.success() {
                    // Restore old exe
                    std::fs::rename(&old_exe, &current_exe).ok();
                    return Err("Failed to extract update".to_string());
                }
                
                // Clean up
                std::fs::remove_file(&old_exe).ok();
                std::fs::remove_file(update_path).ok();
                
                // Restart app
                std::process::Command::new(&current_exe)
                    .spawn()
                    .ok();
                
                std::process::exit(0);
            }
            _ => Err("Unsupported platform".to_string()),
        }
    }
    
    /// Schedule automatic update checks
    pub async fn schedule_update_checks(&self) {
        let app_handle = self.app_handle.clone();
        
        tokio::spawn(async move {
            loop {
                // Check every 24 hours
                tokio::time::sleep(tokio::time::Duration::from_secs(86400)).await;
                
                let updater = Updater::new(app_handle.clone());
                
                match updater.check_for_updates().await {
                    Ok(update_check) => {
                        if update_check.has_update {
                            // Emit event to frontend
                            app_handle.emit_all("update-available", &update_check)
                                .ok();
                        }
                    }
                    Err(e) => {
                        eprintln!("Auto update check failed: {}", e);
                    }
                }
            }
        });
    }
}

/// Tauri command: Check for updates
#[tauri::command]
pub async fn check_for_updates(app_handle: AppHandle) -> Result<UpdateCheck, String> {
    let updater = Updater::new(app_handle);
    updater.check_for_updates().await
}

/// Tauri command: Skip version
#[tauri::command]
pub async fn skip_update_version(app_handle: AppHandle, version: String) -> Result<(), String> {
    let updater = Updater::new(app_handle);
    updater.skip_version(&version).await
}

/// Tauri command: Download and install update
#[tauri::command]
pub async fn install_update(app_handle: AppHandle, version_info: VersionInfo) -> Result<(), String> {
    let updater = Updater::new(app_handle);
    updater.download_and_install(&version_info).await
}

/// Initialize auto-updater
pub fn init_updater(app_handle: AppHandle) {
    let updater = Updater::new(app_handle);
    
    // Spawn background task for scheduled checks
    tauri::async_runtime::spawn(async move {
        updater.schedule_update_checks().await;
    });
}

// Extension trait for Database to handle update settings
trait UpdateSettingsExt {
    fn save_setting(&self, key: &str, value: &str) -> Result<(), rusqlite::Error>;
    fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error>;
}

impl UpdateSettingsExt for Database {
    fn save_setting(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            [key, value, &SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs().to_string()],
        )?;
        Ok(())
    }
    
    fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT value FROM settings WHERE key = ?1"
        )?;
        
        let result = stmt.query_row([key], |row| {
            row.get::<_, String>(0)
        });
        
        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
