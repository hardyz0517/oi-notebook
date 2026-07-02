use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWorkbenchPreview {
    pub runtime_ready: bool,
    pub workspace_ready: bool,
    pub research_boundary_ready: bool,
    pub legacy_sidebar_isolated: bool,
}

#[tauri::command]
pub fn get_agent_workbench_preview() -> AgentWorkbenchPreview {
    AgentWorkbenchPreview {
        runtime_ready: true,
        workspace_ready: true,
        research_boundary_ready: true,
        legacy_sidebar_isolated: true,
    }
}
