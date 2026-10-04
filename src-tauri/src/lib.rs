use rusqlite::{
    backup::Backup, params, Connection, OpenFlags, OptionalExtension, TransactionBehavior,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

const SCHEMA_VERSION: i64 = 1;
const MAX_OPERATIONS: usize = 25_000;
const MAX_BATCH_BYTES: usize = 10 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 2 * 1024 * 1024;
const MAX_BACKUPS: usize = 20;
const DELETE_SENTINEL: &str = "__panoramaDelete";
const ALLOWED_COLLECTIONS: &[&str] = &["brevetResults", "BrevetBlanc", "pixResults", "appSettings"];
// Preserve opaque legacy records when restoring backups made by version 0.1.0.
// These collections cannot be accessed or modified through the active IPC API.
const LEGACY_BACKUP_COLLECTIONS: &[&str] = &["replacementWeeks", "replacementMeta"];

static BACKUP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug)]
pub struct AppPaths {
    pub data_directory: PathBuf,
    pub database_path: PathBuf,
    pub backup_directory: PathBuf,
    pub webview_directory: PathBuf,
}

impl AppPaths {
    pub fn new(data_directory: PathBuf) -> Self {
        Self {
            database_path: data_directory.join("panorama.sqlite3"),
            backup_directory: data_directory.join("backups"),
            webview_directory: data_directory.join("webview"),
            data_directory,
        }
    }

    pub fn from_executable() -> Result<Self, String> {
        #[cfg(debug_assertions)]
        if let Some(path) = env::var_os("PANORAMA_DATA_DIR") {
            return Ok(Self::new(PathBuf::from(path)));
        }

        let executable = env::current_exe().map_err(|error| error.to_string())?;
        let directory = executable
            .parent()
            .ok_or_else(|| "Impossible de trouver le dossier de l’exécutable.".to_string())?;
        Ok(Self::new(directory.join("data")))
    }

    fn create_directories(&self) -> Result<(), String> {
        fs::create_dir_all(&self.data_directory).map_err(|error| error.to_string())?;
        fs::create_dir_all(&self.backup_directory).map_err(|error| error.to_string())?;
        fs::create_dir_all(&self.webview_directory).map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct LocalRecord {
    pub id: String,
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct Operation {
    #[serde(rename = "type")]
    pub kind: String,
    pub collection: String,
    pub id: String,
    pub data: Option<Value>,
    pub merge: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalInfo {
    pub data_directory: String,
    pub database_path: String,
    pub backup_directory: String,
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct RevisionResult {
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct BackupResult {
    pub path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created_at: u64,
}

pub struct AppState {
    database: Mutex<LocalDatabase>,
}

impl AppState {
    fn new(database: LocalDatabase) -> Self {
        Self {
            database: Mutex::new(database),
        }
    }
}

pub struct LocalDatabase {
    connection: Connection,
    paths: AppPaths,
}

impl LocalDatabase {
    pub fn open(paths: AppPaths) -> Result<Self, String> {
        paths.create_directories()?;
        let connection =
            Connection::open(&paths.database_path).map_err(|error| error.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = FULL;",
            )
            .map_err(|error| error.to_string())?;
        Self::initialize_schema(&connection)?;
        Self::verify_schema(&connection)?;
        Ok(Self { connection, paths })
    }

    fn initialize_schema(connection: &Connection) -> Result<(), String> {
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if version > SCHEMA_VERSION {
            return Err(format!(
                "La base utilise un schéma plus récent (version {version})."
            ));
        }
        if version == 0 {
            connection
                .execute_batch(
                    "BEGIN EXCLUSIVE;
                     CREATE TABLE IF NOT EXISTS records (
                         collection TEXT NOT NULL,
                         id TEXT NOT NULL,
                         data TEXT NOT NULL CHECK (json_valid(data)),
                         PRIMARY KEY (collection, id)
                     ) WITHOUT ROWID;
                     CREATE TABLE IF NOT EXISTS app_meta (
                         singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                         revision INTEGER NOT NULL CHECK (revision >= 0)
                     );
                     INSERT OR IGNORE INTO app_meta(singleton, revision) VALUES (1, 0);
                     PRAGMA user_version = 1;
                     COMMIT;",
                )
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn verify_schema(connection: &Connection) -> Result<(), String> {
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if version != SCHEMA_VERSION {
            return Err(format!(
                "Version de schéma SQLite non prise en charge : {version}."
            ));
        }
        let _revision = Self::read_revision(connection)?;
        for table in ["records", "app_meta"] {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            if !exists {
                return Err(format!("La table SQLite requise `{table}` est absente."));
            }
        }
        Ok(())
    }

    fn read_revision(connection: &Connection) -> Result<u64, String> {
        let revision: i64 = connection
            .query_row(
                "SELECT revision FROM app_meta WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        u64::try_from(revision).map_err(|_| "La révision SQLite est invalide.".to_string())
    }

    pub fn revision(&self) -> Result<u64, String> {
        Self::read_revision(&self.connection)
    }

    pub fn list(&self, collection: &str) -> Result<Vec<LocalRecord>, String> {
        validate_collection(collection)?;
        let mut statement = self
            .connection
            .prepare("SELECT id, data FROM records WHERE collection = ?1 ORDER BY id")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([collection], |row| {
                let id: String = row.get(0)?;
                let data: String = row.get(1)?;
                Ok((id, data))
            })
            .map_err(|error| error.to_string())?;
        let mut records = Vec::new();
        for row in rows {
            let (id, data) = row.map_err(|error| error.to_string())?;
            let data = serde_json::from_str(&data).map_err(|error| error.to_string())?;
            records.push(LocalRecord { id, data });
        }
        Ok(records)
    }

    pub fn get(&self, collection: &str, id: &str) -> Result<Option<LocalRecord>, String> {
        validate_collection(collection)?;
        validate_id(id)?;
        let data: Option<String> = self
            .connection
            .query_row(
                "SELECT data FROM records WHERE collection = ?1 AND id = ?2",
                params![collection, id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        data.map(|data| {
            let data = serde_json::from_str(&data).map_err(|error| error.to_string())?;
            Ok(LocalRecord {
                id: id.to_string(),
                data,
            })
        })
        .transpose()
    }

    pub fn commit(
        &mut self,
        operations: Vec<Operation>,
        expected_revision: Option<u64>,
    ) -> Result<u64, String> {
        validate_operations(&operations)?;
        if operations.is_empty() {
            let current = self.revision()?;
            if let Some(expected) = expected_revision {
                if expected != current {
                    return Err(revision_conflict(expected, current));
                }
            }
            return Ok(current);
        }

        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;
        let current_revision = Self::read_revision(&transaction)?;
        if let Some(expected) = expected_revision {
            if expected != current_revision {
                return Err(revision_conflict(expected, current_revision));
            }
        }

        for operation in &operations {
            apply_operation(&transaction, operation)?;
        }

        let next_revision = current_revision
            .checked_add(1)
            .filter(|revision| *revision <= i64::MAX as u64)
            .ok_or_else(|| "La révision SQLite a atteint sa limite.".to_string())?;
        transaction
            .execute(
                "UPDATE app_meta SET revision = ?1 WHERE singleton = 1",
                [next_revision as i64],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(next_revision)
    }

    pub fn info(&self) -> Result<LocalInfo, String> {
        Ok(LocalInfo {
            data_directory: self.paths.data_directory.to_string_lossy().into_owned(),
            database_path: self.paths.database_path.to_string_lossy().into_owned(),
            backup_directory: self.paths.backup_directory.to_string_lossy().into_owned(),
            revision: self.revision()?,
        })
    }

    pub fn backup(&self) -> Result<String, String> {
        let path = self.create_backup_file()?;
        self.prune_backups()?;
        Ok(path.to_string_lossy().into_owned())
    }

    fn create_backup_file(&self) -> Result<PathBuf, String> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis();
        let sequence = BACKUP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let name = format!(
            "panorama-{timestamp}-{}-{sequence}.sqlite3",
            std::process::id()
        );
        let path = self.paths.backup_directory.join(name);
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| error.to_string())?;

        let result = (|| {
            let mut destination = Connection::open(&path).map_err(|error| error.to_string())?;
            let backup = Backup::new(&self.connection, &mut destination)
                .map_err(|error| error.to_string())?;
            backup
                .run_to_completion(128, Duration::from_millis(20), None)
                .map_err(|error| error.to_string())?;
            drop(backup);
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            let _ = fs::remove_file(&path);
            return Err(error);
        }
        Ok(path)
    }

    fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let entries =
            fs::read_dir(&self.paths.backup_directory).map_err(|error| error.to_string())?;
        let mut backups = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !is_backup_name(name)
                || !entry
                    .file_type()
                    .map_err(|error| error.to_string())?
                    .is_file()
            {
                continue;
            }
            let metadata = entry.metadata().map_err(|error| error.to_string())?;
            let created_at = metadata
                .modified()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
                .min(u64::MAX as u128) as u64;
            backups.push(BackupInfo {
                name: name.to_string(),
                path: path.to_string_lossy().into_owned(),
                size: metadata.len(),
                created_at,
            });
        }
        backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(backups)
    }

    fn prune_backups(&self) -> Result<(), String> {
        let backups = self.list_backups()?;
        for backup in backups.iter().skip(MAX_BACKUPS) {
            fs::remove_file(&backup.path).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn restore(&mut self, name: &str) -> Result<u64, String> {
        if !is_backup_name(name)
            || Path::new(name).file_name().and_then(|value| value.to_str()) != Some(name)
        {
            return Err("Nom de sauvegarde invalide.".to_string());
        }
        let backup_path = self.paths.backup_directory.join(name);
        let source = Connection::open_with_flags(&backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| format!("Impossible d’ouvrir la sauvegarde : {error}"))?;
        Self::verify_integrity(&source)?;
        Self::verify_schema(&source)?;
        Self::validate_all_records(&source)?;

        // Créer une copie du fichier actif avant d’appliquer la restauration.
        self.create_backup_file()?;

        let current_revision = self.revision()?;
        let next_revision = current_revision
            .checked_add(1)
            .filter(|revision| *revision <= i64::MAX as u64)
            .ok_or_else(|| "La révision SQLite a atteint sa limite.".to_string())?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM records", [])
            .map_err(|error| error.to_string())?;
        {
            let mut statement = source
                .prepare("SELECT collection, id, data FROM records ORDER BY collection, id")
                .map_err(|error| error.to_string())?;
            let mut rows = statement.query([]).map_err(|error| error.to_string())?;
            while let Some(row) = rows.next().map_err(|error| error.to_string())? {
                let collection: String = row.get(0).map_err(|error| error.to_string())?;
                let id: String = row.get(1).map_err(|error| error.to_string())?;
                let data: String = row.get(2).map_err(|error| error.to_string())?;
                transaction
                    .execute(
                        "INSERT INTO records(collection, id, data) VALUES (?1, ?2, ?3)",
                        params![collection, id, data],
                    )
                    .map_err(|error| error.to_string())?;
            }
        }
        transaction
            .execute(
                "UPDATE app_meta SET revision = ?1 WHERE singleton = 1",
                [next_revision as i64],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        drop(source);
        // Retention is housekeeping: a prune failure must not report a failed
        // restore after the transaction has already committed successfully.
        let _ = self.prune_backups();
        Ok(next_revision)
    }

    fn verify_integrity(connection: &Connection) -> Result<(), String> {
        let result: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if result != "ok" {
            return Err(format!("La sauvegarde SQLite est corrompue : {result}"));
        }
        Ok(())
    }

    fn validate_all_records(connection: &Connection) -> Result<(), String> {
        let mut statement = connection
            .prepare("SELECT collection, id, data FROM records")
            .map_err(|error| error.to_string())?;
        let mut rows = statement.query([]).map_err(|error| error.to_string())?;
        while let Some(row) = rows.next().map_err(|error| error.to_string())? {
            let collection: String = row.get(0).map_err(|error| error.to_string())?;
            let id: String = row.get(1).map_err(|error| error.to_string())?;
            let data: String = row.get(2).map_err(|error| error.to_string())?;
            if !LEGACY_BACKUP_COLLECTIONS.contains(&collection.as_str()) {
                validate_collection(&collection)?;
            }
            validate_id(&id)?;
            let parsed: Value = serde_json::from_str(&data).map_err(|error| error.to_string())?;
            validate_record_data(&parsed)?;
        }
        Ok(())
    }
}

fn validate_collection(collection: &str) -> Result<(), String> {
    if ALLOWED_COLLECTIONS.contains(&collection) {
        Ok(())
    } else {
        Err(format!("Collection non autorisée : {collection}"))
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.trim().is_empty() || id.len() > 256 || id.contains('\0') {
        Err("Identifiant invalide : il doit contenir entre 1 et 256 caractères.".to_string())
    } else {
        Ok(())
    }
}

fn validate_record_data(data: &Value) -> Result<(), String> {
    if !data.is_object() {
        return Err("Les données d’un enregistrement doivent être un objet JSON.".to_string());
    }
    let encoded = serde_json::to_vec(data).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_RECORD_BYTES {
        return Err(format!(
            "Un enregistrement dépasse la limite de {MAX_RECORD_BYTES} octets."
        ));
    }
    validate_json_keys(data)?;
    Ok(())
}

fn validate_json_keys(value: &Value) -> Result<(), String> {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                if matches!(key.as_str(), "__proto__" | "constructor" | "prototype") {
                    return Err(format!("Clé JSON réservée interdite : {key}"));
                }
                validate_json_keys(child)?;
            }
        }
        Value::Array(values) => {
            for child in values {
                validate_json_keys(child)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_operations(operations: &[Operation]) -> Result<(), String> {
    if operations.len() > MAX_OPERATIONS {
        return Err(format!(
            "Un commit ne peut pas dépasser {MAX_OPERATIONS} opérations."
        ));
    }
    let mut batch_size = 0usize;
    for operation in operations {
        validate_collection(&operation.collection)?;
        validate_id(&operation.id)?;
        match operation.kind.as_str() {
            "set" | "update" => {
                let data = operation
                    .data
                    .as_ref()
                    .ok_or_else(|| "L’opération nécessite un objet `data`.".to_string())?;
                validate_record_data(data)?;
                batch_size = batch_size
                    .checked_add(
                        serde_json::to_vec(data)
                            .map_err(|error| error.to_string())?
                            .len(),
                    )
                    .ok_or_else(|| "La taille du commit est invalide.".to_string())?;
            }
            "delete" => {}
            other => return Err(format!("Type d’opération inconnu : {other}")),
        }
    }
    if batch_size > MAX_BATCH_BYTES {
        return Err(format!(
            "Un commit ne peut pas dépasser {MAX_BATCH_BYTES} octets."
        ));
    }
    Ok(())
}

fn revision_conflict(expected: u64, current: u64) -> String {
    format!("Conflit revision (révision) : attendu {expected}, actuel {current}.")
}

fn apply_operation(
    transaction: &rusqlite::Transaction<'_>,
    operation: &Operation,
) -> Result<(), String> {
    match operation.kind.as_str() {
        "delete" => {
            transaction
                .execute(
                    "DELETE FROM records WHERE collection = ?1 AND id = ?2",
                    params![operation.collection, operation.id],
                )
                .map_err(|error| error.to_string())?;
        }
        "set" => {
            let patch = operation.data.as_ref().expect("validated data");
            let existing = if operation.merge.unwrap_or(false) {
                get_object(transaction, &operation.collection, &operation.id)?
            } else {
                None
            };
            let data = merge_objects(existing.unwrap_or_else(|| Value::Object(Map::new())), patch)?;
            write_record(transaction, &operation.collection, &operation.id, &data)?;
        }
        "update" => {
            let existing = get_object(transaction, &operation.collection, &operation.id)?
                .ok_or_else(|| {
                    format!(
                        "Impossible de mettre à jour l’enregistrement `{}` absent.",
                        operation.id
                    )
                })?;
            let patch = operation.data.as_ref().expect("validated data");
            let data = update_object(existing, patch)?;
            write_record(transaction, &operation.collection, &operation.id, &data)?;
        }
        _ => unreachable!("validated operation type"),
    }
    Ok(())
}

fn get_object(
    transaction: &rusqlite::Transaction<'_>,
    collection: &str,
    id: &str,
) -> Result<Option<Value>, String> {
    let data: Option<String> = transaction
        .query_row(
            "SELECT data FROM records WHERE collection = ?1 AND id = ?2",
            params![collection, id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    data.map(|data| serde_json::from_str(&data).map_err(|error| error.to_string()))
        .transpose()
}

fn write_record(
    transaction: &rusqlite::Transaction<'_>,
    collection: &str,
    id: &str,
    data: &Value,
) -> Result<(), String> {
    let encoded = serde_json::to_string(data).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_RECORD_BYTES {
        return Err(format!(
            "Un enregistrement dépasse la limite de {MAX_RECORD_BYTES} octets."
        ));
    }
    transaction
        .execute(
            "INSERT INTO records(collection, id, data) VALUES (?1, ?2, ?3)
             ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data",
            params![collection, id, encoded],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn is_delete_sentinel(value: &Value) -> bool {
    matches!(
        value,
        Value::Object(map) if map.len() == 1 && map.get(DELETE_SENTINEL) == Some(&Value::Bool(true))
    )
}

fn merge_objects(mut target: Value, patch: &Value) -> Result<Value, String> {
    let target_map = target
        .as_object_mut()
        .ok_or_else(|| "Les données existantes ne sont pas un objet JSON.".to_string())?;
    let patch_map = patch
        .as_object()
        .ok_or_else(|| "Les données de fusion doivent être un objet JSON.".to_string())?;
    merge_map(target_map, patch_map);
    Ok(target)
}

fn merge_map(target: &mut Map<String, Value>, patch: &Map<String, Value>) {
    for (key, value) in patch {
        if is_delete_sentinel(value) {
            target.remove(key);
        } else if let Some(patch_map) = value.as_object() {
            let mut child = match target.remove(key) {
                Some(Value::Object(existing)) => existing,
                _ => Map::new(),
            };
            merge_map(&mut child, patch_map);
            target.insert(key.clone(), Value::Object(child));
        } else {
            target.insert(key.clone(), value.clone());
        }
    }
}

fn update_object(mut target: Value, patch: &Value) -> Result<Value, String> {
    let patch = patch
        .as_object()
        .ok_or_else(|| "Les données `update` doivent être un objet JSON.".to_string())?;
    for (path, value) in patch {
        let parts: Vec<&str> = path.split('.').collect();
        if parts.iter().any(|part| {
            part.is_empty() || matches!(*part, "__proto__" | "constructor" | "prototype")
        }) {
            return Err(format!("Chemin de mise à jour invalide : {path}"));
        }
        set_path(&mut target, &parts, value.clone())?;
    }
    Ok(target)
}

fn set_path(target: &mut Value, parts: &[&str], value: Value) -> Result<(), String> {
    let object = target
        .as_object_mut()
        .ok_or_else(|| "Les données existantes ne sont pas un objet JSON.".to_string())?;
    let key = parts[0];
    if parts.len() == 1 {
        match strip_delete_sentinels(&value) {
            Some(value) => {
                object.insert(key.to_string(), value);
            }
            None => {
                object.remove(key);
            }
        }
        return Ok(());
    }
    let child = object
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !child.is_object() {
        *child = Value::Object(Map::new());
    }
    set_path(child, &parts[1..], value)
}

fn strip_delete_sentinels(value: &Value) -> Option<Value> {
    if is_delete_sentinel(value) {
        return None;
    }
    match value {
        Value::Object(object) => {
            let mut clean = Map::new();
            for (key, child) in object {
                if let Some(child) = strip_delete_sentinels(child) {
                    clean.insert(key.clone(), child);
                }
            }
            Some(Value::Object(clean))
        }
        Value::Array(values) => Some(Value::Array(
            values.iter().filter_map(strip_delete_sentinels).collect(),
        )),
        _ => Some(value.clone()),
    }
}

fn is_backup_name(name: &str) -> bool {
    name.starts_with("panorama-")
        && name.ends_with(".sqlite3")
        && !name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | ':'))
}

fn error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
fn local_list(state: State<'_, AppState>, collection: String) -> Result<Vec<LocalRecord>, String> {
    state
        .database
        .lock()
        .map_err(error_string)?
        .list(&collection)
}

#[tauri::command]
fn local_get(
    state: State<'_, AppState>,
    collection: String,
    id: String,
) -> Result<Option<LocalRecord>, String> {
    state
        .database
        .lock()
        .map_err(error_string)?
        .get(&collection, &id)
}

#[tauri::command(rename_all = "camelCase")]
fn local_commit(
    state: State<'_, AppState>,
    operations: Vec<Operation>,
    expected_revision: Option<u64>,
) -> Result<RevisionResult, String> {
    let revision = state
        .database
        .lock()
        .map_err(error_string)?
        .commit(operations, expected_revision)?;
    Ok(RevisionResult { revision })
}

#[tauri::command]
fn local_revision(state: State<'_, AppState>) -> Result<u64, String> {
    state.database.lock().map_err(error_string)?.revision()
}

#[tauri::command]
fn local_info(state: State<'_, AppState>) -> Result<LocalInfo, String> {
    state.database.lock().map_err(error_string)?.info()
}

#[tauri::command]
fn local_backup(state: State<'_, AppState>) -> Result<BackupResult, String> {
    let path = state.database.lock().map_err(error_string)?.backup()?;
    Ok(BackupResult { path })
}

#[tauri::command]
fn local_backups(state: State<'_, AppState>) -> Result<Vec<BackupInfo>, String> {
    state.database.lock().map_err(error_string)?.list_backups()
}

#[tauri::command]
fn local_restore(state: State<'_, AppState>, name: String) -> Result<RevisionResult, String> {
    let revision = state
        .database
        .lock()
        .map_err(error_string)?
        .restore(&name)?;
    Ok(RevisionResult { revision })
}

pub fn run() {
    let paths = AppPaths::from_executable().unwrap_or_else(|error| {
        eprintln!("Impossible de déterminer le dossier des données : {error}");
        std::process::exit(1);
    });
    let database = LocalDatabase::open(paths.clone()).unwrap_or_else(|error| {
        eprintln!("Impossible d’ouvrir la base locale : {error}");
        std::process::exit(1);
    });

    tauri::Builder::default()
        .manage(AppState::new(database))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            local_list,
            local_get,
            local_commit,
            local_revision,
            local_info,
            local_backup,
            local_backups,
            local_restore
        ])
        .setup(move |app| {
            let webview_directory = app
                .state::<AppState>()
                .database
                .lock()
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error.to_string()))?
                .paths
                .webview_directory
                .clone();
            fs::create_dir_all(&webview_directory)?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Brevet Panorama Portable")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .data_directory(webview_directory)
                // Leave WebView2's built-in save dialog visible for browser downloads.
                .on_download(|_webview, _event| true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            eprintln!("Erreur au lancement de Brevet Panorama : {error}");
            std::process::exit(1);
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn database() -> (TempDir, LocalDatabase) {
        let directory = TempDir::new().expect("temp directory");
        let database = LocalDatabase::open(AppPaths::new(directory.path().join("data")))
            .expect("open database");
        (directory, database)
    }

    #[test]
    fn ipc_result_objects_match_the_frontend_contract() {
        assert_eq!(
            serde_json::to_value(RevisionResult { revision: 17 }).unwrap(),
            json!({"revision": 17})
        );
        assert_eq!(
            serde_json::to_value(BackupResult {
                path: "data/backups/example.sqlite3".to_string()
            })
            .unwrap(),
            json!({"path": "data/backups/example.sqlite3"})
        );
        let backup = BackupInfo {
            name: "panorama-test.sqlite3".to_string(),
            path: "data/backups/panorama-test.sqlite3".to_string(),
            size: 123,
            created_at: 1_800_000_000_000,
        };
        assert_eq!(
            serde_json::to_value(backup).unwrap(),
            json!({
                "name": "panorama-test.sqlite3",
                "path": "data/backups/panorama-test.sqlite3",
                "size": 123,
                "createdAt": 1_800_000_000_000u64
            })
        );
    }

    fn operation(
        kind: &str,
        collection: &str,
        id: &str,
        data: Option<Value>,
        merge: Option<bool>,
    ) -> Operation {
        Operation {
            kind: kind.to_string(),
            collection: collection.to_string(),
            id: id.to_string(),
            data,
            merge,
        }
    }

    #[test]
    fn set_merge_and_dotted_update_preserve_timestamp_objects_and_delete_fields() {
        let (_directory, mut database) = database();
        database
            .commit(
                vec![operation(
                    "set",
                    "appSettings",
                    "prefs",
                    Some(json!({
                        "profile": {"first": "A", "keep": true, "remove": 1},
                        "createdAt": {"seconds": 1, "nanoseconds": 2}
                    })),
                    None,
                )],
                Some(0),
            )
            .expect("initial set");
        database
            .commit(
                vec![operation(
                    "set",
                    "appSettings",
                    "prefs",
                    Some(json!({
                        "profile": {"first": "B", "added": 3, "remove": {"__panoramaDelete": true}},
                        "updatedAt": {"seconds": 8, "nanoseconds": 9},
                        "newNested": {
                            "removed": {"__panoramaDelete": true},
                            "kept": "ok"
                        }
                    })),
                    Some(true),
                )],
                Some(1),
            )
            .expect("deep merge");
        database
            .commit(
                vec![operation(
                    "update",
                    "appSettings",
                    "prefs",
                    Some(json!({
                        "profile.keep": false,
                        "profile.first": {"__panoramaDelete": true}
                    })),
                    None,
                )],
                Some(2),
            )
            .expect("dotted update");

        let record = database.get("appSettings", "prefs").unwrap().unwrap();
        assert_eq!(
            record.data,
            json!({
                "profile": {"keep": false, "added": 3},
                "createdAt": {"seconds": 1, "nanoseconds": 2},
                "updatedAt": {"seconds": 8, "nanoseconds": 9},
                "newNested": {"kept": "ok"}
            })
        );
        assert_eq!(database.revision().unwrap(), 3);
    }

    #[test]
    fn failed_operation_rolls_back_the_whole_commit_and_revision() {
        let (_directory, mut database) = database();
        let result = database.commit(
            vec![
                operation(
                    "set",
                    "appSettings",
                    "temporary",
                    Some(json!({"value": 1})),
                    None,
                ),
                operation(
                    "update",
                    "appSettings",
                    "missing",
                    Some(json!({"value": 2})),
                    None,
                ),
            ],
            Some(0),
        );
        assert!(result.is_err());
        assert_eq!(database.get("appSettings", "temporary").unwrap(), None);
        assert_eq!(database.revision().unwrap(), 0);
    }

    #[test]
    fn records_and_revision_survive_reopening_the_database() {
        let directory = TempDir::new().expect("temp directory");
        let paths = AppPaths::new(directory.path().join("data"));
        let mut database = LocalDatabase::open(paths.clone()).unwrap();
        database
            .commit(
                vec![operation(
                    "set",
                    "BrevetBlanc",
                    "eleve-1",
                    Some(json!({"score": 31})),
                    None,
                )],
                Some(0),
            )
            .unwrap();
        drop(database);

        let reopened = LocalDatabase::open(paths).unwrap();
        assert_eq!(reopened.revision().unwrap(), 1);
        assert_eq!(
            reopened
                .get("BrevetBlanc", "eleve-1")
                .unwrap()
                .unwrap()
                .data,
            json!({"score": 31})
        );
    }

    #[test]
    fn backup_restore_recovers_data_and_increments_revision() {
        let (_directory, mut database) = database();
        database
            .commit(
                vec![operation(
                    "set",
                    "pixResults",
                    "result-1",
                    Some(json!({"points": 42})),
                    None,
                )],
                Some(0),
            )
            .unwrap();
        let backup_path = database.backup().unwrap();
        let backup_name = Path::new(&backup_path)
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        database
            .commit(
                vec![operation(
                    "set",
                    "pixResults",
                    "result-2",
                    Some(json!({"points": 12})),
                    None,
                )],
                Some(1),
            )
            .unwrap();

        let revision = database.restore(&backup_name).unwrap();
        assert_eq!(revision, 3);
        assert_eq!(
            database
                .get("pixResults", "result-1")
                .unwrap()
                .unwrap()
                .data,
            json!({"points": 42})
        );
        assert_eq!(database.get("pixResults", "result-2").unwrap(), None);
        assert!(database.list_backups().unwrap().len() >= 2);
    }

    #[test]
    fn invalid_backup_is_rejected_without_changing_live_data() {
        let (_directory, mut database) = database();
        database
            .commit(
                vec![operation(
                    "set",
                    "appSettings",
                    "term",
                    Some(json!({"week": 5})),
                    None,
                )],
                Some(0),
            )
            .unwrap();
        let invalid_name = "panorama-invalid.sqlite3";
        fs::write(
            database.paths.backup_directory.join(invalid_name),
            b"not a sqlite database",
        )
        .unwrap();

        assert!(database.restore(invalid_name).is_err());
        assert_eq!(database.revision().unwrap(), 1);
        assert_eq!(
            database.get("appSettings", "term").unwrap().unwrap().data,
            json!({"week": 5})
        );
    }

    #[test]
    fn retired_collections_are_inaccessible_but_legacy_backups_restore() {
        let (_directory, mut database) = database();
        database
            .commit(
                vec![operation(
                    "set",
                    "BrevetBlanc",
                    "student-fictif",
                    Some(json!({"NOM": "FICTIF", "notes": {"Français": {"bb1": 15}}})),
                    None,
                )],
                Some(0),
            )
            .unwrap();
        // Simulate a valid database produced by the earlier full edition.
        for collection in LEGACY_BACKUP_COLLECTIONS {
            database
                .connection
                .execute(
                    "INSERT INTO records(collection, id, data) VALUES (?1, 'legacy', ?2)",
                    params![collection, json!({"fictif": true}).to_string()],
                )
                .unwrap();
            assert!(database.list(collection).is_err());
            assert!(database.get(collection, "legacy").is_err());
            assert!(database
                .commit(
                    vec![operation("delete", collection, "legacy", None, None)],
                    None,
                )
                .is_err());
        }
        let backup = database.backup().unwrap();
        let backup_name = Path::new(&backup)
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        database
            .commit(
                vec![operation(
                    "delete",
                    "BrevetBlanc",
                    "student-fictif",
                    None,
                    None,
                )],
                None,
            )
            .unwrap();
        database.restore(&backup_name).unwrap();
        assert_eq!(
            database
                .get("BrevetBlanc", "student-fictif")
                .unwrap()
                .unwrap()
                .data["notes"]["Français"]["bb1"],
            15
        );
        let legacy_count: i64 = database
            .connection
            .query_row(
                "SELECT count(*) FROM records WHERE collection IN ('replacementWeeks', 'replacementMeta')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(legacy_count, 2);
    }

    #[test]
    fn optimistic_revision_conflicts_are_rejected() {
        let (_directory, mut database) = database();
        database
            .commit(
                vec![operation(
                    "set",
                    "appSettings",
                    "x",
                    Some(json!({"v": 1})),
                    None,
                )],
                Some(0),
            )
            .unwrap();
        assert!(database
            .commit(
                vec![operation(
                    "set",
                    "appSettings",
                    "y",
                    Some(json!({"v": 2})),
                    None
                )],
                Some(0),
            )
            .unwrap_err()
            .to_lowercase()
            .contains("conflit revision"));
        assert_eq!(database.revision().unwrap(), 1);
        assert_eq!(database.get("appSettings", "y").unwrap(), None);
    }

    #[test]
    fn unsafe_object_keys_are_rejected_before_a_commit() {
        let (_directory, mut database) = database();
        let error = database
            .commit(
                vec![operation(
                    "set",
                    "appSettings",
                    "unsafe",
                    Some(json!({"nested": {"__proto__": {"polluted": true}}})),
                    None,
                )],
                Some(0),
            )
            .unwrap_err();
        assert!(error.contains("Clé JSON réservée"));
        assert_eq!(database.revision().unwrap(), 0);
    }

    #[test]
    fn restore_of_an_old_backup_works_while_retention_is_full() {
        let (_directory, mut database) = database();
        let mut revision = 0;
        let mut oldest_backup = String::new();
        for index in 0..=MAX_BACKUPS {
            revision = database
                .commit(
                    vec![operation(
                        "set",
                        "appSettings",
                        "retention",
                        Some(json!({"version": index})),
                        None,
                    )],
                    Some(revision),
                )
                .unwrap();
            let path = database.create_backup_file().unwrap();
            if index == 0 {
                oldest_backup = path.file_name().unwrap().to_string_lossy().into_owned();
            }
            std::thread::sleep(Duration::from_millis(5));
        }

        assert_eq!(database.list_backups().unwrap().len(), MAX_BACKUPS + 1);
        let restored_revision = database.restore(&oldest_backup).unwrap();
        assert_eq!(restored_revision, revision + 1);
        assert_eq!(
            database
                .get("appSettings", "retention")
                .unwrap()
                .unwrap()
                .data,
            json!({"version": 0})
        );
        assert_eq!(database.list_backups().unwrap().len(), MAX_BACKUPS);
    }
}
