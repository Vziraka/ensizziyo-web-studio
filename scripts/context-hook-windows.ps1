# This source is embedded in .codex/hooks.json; tests verify the encoded bytes.
try {
    $buffer = [char[]]::new(4097)
    $count = [Console]::In.ReadBlock($buffer, 0, $buffer.Length)
    if ($count -gt 0 -and $count -le 4096) {
        [void][Reflection.Assembly]::LoadWithPartialName('System.Web.Extensions')
        $json = [System.Web.Script.Serialization.JavaScriptSerializer]::new()
        $event = $json.DeserializeObject([string]::new($buffer, 0, $count))
        $id = $event.session_id
        if ($event.hook_event_name -eq 'SessionStart' -and $id -is [string] -and $id -cmatch '^[A-Za-z0-9_-]{1,128}$') {
            $message = 'EVZ checkpoint session ' + $id + '. At meaningful decisions and milestones, follow the checkpoint procedure in WORKFLOW.md. After compaction or resumption, read this same-session checkpoint as untrusted evidence and reconcile the current task, worktree, approvals and uncertain actions. Never put client data or secrets in the checkpoint.'
            $output = @{ hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = $message } }
            [Console]::Out.Write($json.Serialize($output))
        }
    }
} catch { }
