use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWorkbenchPreview {
    pub preview_name: &'static str,
    pub runtime_status: &'static str,
    pub runtime_reason: &'static str,
    pub workspace_status: &'static str,
    pub workspace_reason: &'static str,
    pub research_boundary_status: &'static str,
    pub research_boundary_reason: &'static str,
    pub model_loop_status: &'static str,
    pub patch_status: &'static str,
    pub execute_status: &'static str,
    pub persistence_status: &'static str,
    pub unavailable_reason: &'static str,
    pub legacy_sidebar_isolated: bool,
}

#[tauri::command]
pub fn get_agent_workbench_preview() -> AgentWorkbenchPreview {
    AgentWorkbenchPreview {
        preview_name: "Agent Workbench Foundation Preview",
        runtime_status: "preview",
        runtime_reason: "Manual read-tool runtime events are available for preview only.",
        workspace_status: "preview",
        workspace_reason: "Problem workspace panes are available for preview only.",
        research_boundary_status: "preview",
        research_boundary_reason: "Manual source reading and evidence display are available for preview only.",
        model_loop_status: "unavailable",
        patch_status: "unavailable",
        execute_status: "unavailable",
        persistence_status: "unavailable",
        unavailable_reason: "P4 does not ship a mature agent loop, model loop, patch application, command execution, or persistence.",
        legacy_sidebar_isolated: true,
    }
}
