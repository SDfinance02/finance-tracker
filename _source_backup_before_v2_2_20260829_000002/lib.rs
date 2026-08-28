use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const DB_FILENAME: &str = "finance-v2.db";
const UPDATER_ENDPOINT: Option<&str> = option_env!("FINANCE_UPDATER_ENDPOINT");
const UPDATER_PUBKEY: Option<&str> = option_env!("FINANCE_UPDATER_PUBKEY");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketQuote {
    pub symbol: String,
    pub price: f64,
    pub previous_close: Option<f64>,
    pub day_change_pct: Option<f64>,
    pub currency: Option<String>,
    pub high_52w: Option<f64>,
    pub timestamp: String,
    pub provider: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub configured: bool,
    pub current_version: String,
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub endpoint: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub app_config_dir: String,
    pub database_path: String,
    pub database_exists: bool,
    pub backups_dir: String,
    pub documents_dir: String,
    pub cache_dir: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterFileConfig {
    pub endpoint: String,
    pub pubkey: String,
}

fn empty_quote(symbol: &str, error: String) -> MarketQuote {
    MarketQuote {
        symbol: symbol.to_string(),
        price: 0.0,
        previous_close: None,
        day_change_pct: None,
        currency: None,
        high_52w: None,
        timestamp: Utc::now().to_rfc3339(),
        provider: "Yahoo-compatible".to_string(),
        error: Some(error),
    }
}

async fn quote_one(symbol: &str) -> MarketQuote {
    let encoded = urlencoding::encode(symbol);
    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1y",
        encoded
    );

    let client = match reqwest::Client::builder()
        .user_agent("Mozilla/5.0 FinanceTracker/2.1")
        .build()
    {
        Ok(c) => c,
        Err(e) => return empty_quote(symbol, e.to_string()),
    };

    let response = match client.get(url).send().await {
        Ok(r) => r,
        Err(e) => return empty_quote(symbol, format!("Network error: {e}")),
    };

    if !response.status().is_success() {
        return empty_quote(symbol, format!("HTTP {}", response.status()));
    }

    let body: Value = match response.json().await {
        Ok(v) => v,
        Err(e) => return empty_quote(symbol, format!("Invalid response: {e}")),
    };

    let result = body
        .get("chart")
        .and_then(|v| v.get("result"))
        .and_then(|v| v.as_array())
        .and_then(|a| a.first());

    let Some(result) = result else {
        let message = body
            .get("chart")
            .and_then(|v| v.get("error"))
            .map(|v| v.to_string())
            .unwrap_or_else(|| "No quote returned".to_string());
        return empty_quote(symbol, message);
    };

    let meta = result.get("meta").unwrap_or(&Value::Null);
    let price = meta
        .get("regularMarketPrice")
        .and_then(|v| v.as_f64())
        .or_else(|| meta.get("chartPreviousClose").and_then(|v| v.as_f64()))
        .unwrap_or(0.0);

    let previous_close = meta
        .get("previousClose")
        .and_then(|v| v.as_f64())
        .or_else(|| meta.get("chartPreviousClose").and_then(|v| v.as_f64()));

    let day_change_pct = previous_close.and_then(|p| {
        if p.abs() > f64::EPSILON {
            Some((price - p) / p * 100.0)
        } else {
            None
        }
    });

    let currency = meta
        .get("currency")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let high_52w = result
        .get("indicators")
        .and_then(|v| v.get("quote"))
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.get("high"))
        .and_then(|v| v.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|v| v.as_f64())
                .fold(0.0_f64, |acc, x| acc.max(x))
        })
        .filter(|v| *v > 0.0);

    MarketQuote {
        symbol: symbol.to_string(),
        price,
        previous_close,
        day_change_pct,
        currency,
        high_52w,
        timestamp: Utc::now().to_rfc3339(),
        provider: "Yahoo-compatible".to_string(),
        error: if price > 0.0 { None } else { Some("Price was zero".to_string()) },
    }
}

#[tauri::command]
async fn fetch_market_quotes(symbols: Vec<String>) -> Vec<MarketQuote> {
    let mut out = Vec::with_capacity(symbols.len());
    for symbol in symbols {
        out.push(quote_one(symbol.trim()).await);
    }
    out
}

fn app_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve app configuration folder: {e}"))
}

fn primary_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(DB_FILENAME))
}

fn candidate_db_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(p) = app.path().app_config_dir() {
        candidates.push(p.join(DB_FILENAME));
    }
    // Kept as defensive fallbacks for early V2 development builds.
    if let Ok(p) = app.path().app_data_dir() {
        candidates.push(p.join(DB_FILENAME));
    }
    if let Ok(p) = app.path().app_local_data_dir() {
        candidates.push(p.join(DB_FILENAME));
    }
    candidates
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("Cannot create {}: {e}", path.display()))
}

/// Runs before the JS SQLite connection is opened. It creates one pre-upgrade
/// copy per application version so a schema migration can always be rolled back.
#[tauri::command]
fn prepare_database_upgrade(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let base = app_config_dir(&app)?;
    ensure_dir(&base)?;
    let backups_dir = base.join("backups");
    let pre_upgrade_dir = backups_dir.join("pre-upgrade");
    let documents_dir = base.join("documents");
    let cache_dir = base.join("cache");
    ensure_dir(&backups_dir)?;
    ensure_dir(&pre_upgrade_dir)?;
    ensure_dir(&documents_dir)?;
    ensure_dir(&cache_dir)?;

    let version = app.package_info().version.to_string();
    let marker = base.join(".prepared_app_version");
    let already_prepared = fs::read_to_string(&marker)
        .ok()
        .map(|s| s.trim() == version)
        .unwrap_or(false);

    if already_prepared {
        return Ok(None);
    }

    let source = primary_db_path(&app)?;
    let backup_path = if source.exists() {
        let stamp = Utc::now().format("%Y%m%d_%H%M%S");
        let safe_version = version.replace('.', "_");
        let destination = pre_upgrade_dir.join(format!(
            "finance-v2_before_{safe_version}_{stamp}.db"
        ));
        fs::copy(&source, &destination)
            .map_err(|e| format!("Could not create pre-upgrade database backup: {e}"))?;
        Some(destination.to_string_lossy().to_string())
    } else {
        None
    };

    fs::write(&marker, &version)
        .map_err(|e| format!("Could not write upgrade marker: {e}"))?;
    Ok(backup_path)
}

#[tauri::command]
fn create_database_backup(app: tauri::AppHandle) -> Result<String, String> {
    let source = candidate_db_paths(&app)
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| format!("Could not locate {DB_FILENAME} yet. Open the app once and try again."))?;

    let base = app_config_dir(&app)?;
    let backup_dir = base.join("backups").join("manual");
    ensure_dir(&backup_dir)?;

    let stamp = Utc::now().format("%Y%m%d_%H%M%S");
    let destination = backup_dir.join(format!("finance-v2_{stamp}.db"));
    fs::copy(&source, &destination).map_err(|e| format!("Backup failed: {e}"))?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn database_locations(app: tauri::AppHandle) -> Vec<String> {
    candidate_db_paths(&app)
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
fn storage_info(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    let base = app_config_dir(&app)?;
    let db = base.join(DB_FILENAME);
    Ok(StorageInfo {
        app_config_dir: base.to_string_lossy().to_string(),
        database_path: db.to_string_lossy().to_string(),
        database_exists: db.exists(),
        backups_dir: base.join("backups").to_string_lossy().to_string(),
        documents_dir: base.join("documents").to_string_lossy().to_string(),
        cache_dir: base.join("cache").to_string_lossy().to_string(),
        app_version: app.package_info().version.to_string(),
    })
}

fn updater_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("updater.json"))
}

fn updater_runtime_config(app: &tauri::AppHandle) -> Result<(String, Url), String> {
    // A compile-time release configuration takes precedence. Personal/dev builds
    // can instead persist the public key + HTTPS endpoint in updater.json.
    if let (Some(pubkey), Some(endpoint)) = (UPDATER_PUBKEY, UPDATER_ENDPOINT) {
        let pubkey = pubkey.trim();
        let endpoint = endpoint.trim();
        if !pubkey.is_empty() && !endpoint.is_empty() {
            let url = Url::parse(endpoint).map_err(|e| format!("Invalid updater endpoint: {e}"))?;
            return Ok((pubkey.to_string(), url));
        }
    }

    let path = updater_config_path(app)?;
    let raw = fs::read_to_string(&path)
        .map_err(|_| "Updater release channel has not been configured yet.".to_string())?;
    let config: UpdaterFileConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("Invalid updater configuration: {e}"))?;
    let pubkey = config.pubkey.trim();
    let endpoint = config.endpoint.trim();
    if pubkey.is_empty() || endpoint.is_empty() {
        return Err("Updater release channel is incomplete.".to_string());
    }
    let url = Url::parse(endpoint).map_err(|e| format!("Invalid updater endpoint: {e}"))?;
    if url.scheme() != "https" {
        return Err("Updater endpoint must use HTTPS.".to_string());
    }
    Ok((pubkey.to_string(), url))
}

#[tauri::command]
fn save_updater_config(app: tauri::AppHandle, endpoint: String, pubkey: String) -> Result<(), String> {
    let endpoint = endpoint.trim().to_string();
    let pubkey = pubkey.trim().to_string();
    let url = Url::parse(&endpoint).map_err(|e| format!("Invalid updater endpoint: {e}"))?;
    if url.scheme() != "https" {
        return Err("Updater endpoint must use HTTPS.".to_string());
    }
    if pubkey.len() < 20 {
        return Err("Updater public key looks incomplete.".to_string());
    }
    let base = app_config_dir(&app)?;
    ensure_dir(&base)?;
    let config = UpdaterFileConfig { endpoint, pubkey };
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(updater_config_path(&app)?, json)
        .map_err(|e| format!("Could not save updater configuration: {e}"))
}

#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    let current_version = app.package_info().version.to_string();
    let runtime = updater_runtime_config(&app);
    let endpoint_display = runtime.as_ref().ok().map(|(_, u)| u.to_string());
    let Ok((pubkey, endpoint)) = runtime else {
        return Ok(UpdateStatus {
            configured: false,
            current_version,
            available: false,
            version: None,
            notes: None,
            endpoint: endpoint_display,
            error: None,
        });
    };

    let updater = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(vec![endpoint])
        .map_err(|e| format!("Updater endpoint error: {e}"))?
        .build()
        .map_err(|e| format!("Could not initialize updater: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateStatus {
            configured: true,
            current_version,
            available: true,
            version: Some(update.version.to_string()),
            notes: update.body.clone(),
            endpoint: endpoint_display,
            error: None,
        }),
        Ok(None) => Ok(UpdateStatus {
            configured: true,
            current_version,
            available: false,
            version: None,
            notes: None,
            endpoint: endpoint_display,
            error: None,
        }),
        Err(e) => Ok(UpdateStatus {
            configured: true,
            current_version,
            available: false,
            version: None,
            notes: None,
            endpoint: endpoint_display,
            error: Some(format!("Update check failed: {e}")),
        }),
    }
}

#[tauri::command]
async fn install_available_update(app: tauri::AppHandle) -> Result<(), String> {
    let (pubkey, endpoint) = updater_runtime_config(&app)?;
    let updater = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(vec![endpoint])
        .map_err(|e| format!("Updater endpoint error: {e}"))?
        .build()
        .map_err(|e| format!("Could not initialize updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?
        .ok_or_else(|| "No newer version is available.".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Update installation failed: {e}"))?;

    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            fetch_market_quotes,
            prepare_database_upgrade,
            create_database_backup,
            database_locations,
            storage_info,
            save_updater_config,
            check_for_update,
            install_available_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running Finance Tracker");
}
