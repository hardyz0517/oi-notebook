use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    pub current: usize,
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskError {
    pub message: String,
}
