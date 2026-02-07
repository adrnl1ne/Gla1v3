package tasks

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// ProcessInfo represents information about a running process
type ProcessInfo struct {
	PID     string `json:"pid"`
	Name    string `json:"name"`
	User    string `json:"user,omitempty"`
	CPU     string `json:"cpu,omitempty"`
	Memory  string `json:"memory,omitempty"`
	Command string `json:"command,omitempty"`
}

// processList lists all running processes
func processList() (string, error) {
	var processes []ProcessInfo
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Windows: use tasklist
		cmd = exec.Command("tasklist", "/FO", "CSV", "/NH")
	} else {
		// Linux/Unix: use ps
		cmd = exec.Command("ps", "aux")
	}

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to list processes: %v", err)
	}

	lines := strings.Split(string(output), "\n")

	if runtime.GOOS == "windows" {
		// Parse Windows CSV output
		for _, line := range lines {
			if line == "" {
				continue
			}
			// Remove quotes and split by comma
			line = strings.ReplaceAll(line, "\"", "")
			fields := strings.Split(line, ",")
			if len(fields) >= 2 {
				processes = append(processes, ProcessInfo{
					Name:   fields[0],
					PID:    fields[1],
					Memory: fields[4] + " KB",
				})
			}
		}
	} else {
		// Parse Unix ps output (skip header)
		for i, line := range lines {
			if i == 0 || line == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) >= 11 {
				processes = append(processes, ProcessInfo{
					User:    fields[0],
					PID:     fields[1],
					CPU:     fields[2] + "%",
					Memory:  fields[3] + "%",
					Command: strings.Join(fields[10:], " "),
				})
			}
		}
	}

	result, err := json.MarshalIndent(processes, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal JSON: %v", err)
	}

	return string(result), nil
}

// processKill terminates a process by PID
func processKill(pid string) (string, error) {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Windows: use taskkill
		cmd = exec.Command("taskkill", "/F", "/PID", pid)
	} else {
		// Linux/Unix: use kill
		cmd = exec.Command("kill", "-9", pid)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to kill process %s: %v - %s", pid, err, string(output))
	}

	return fmt.Sprintf("Successfully killed process %s", pid), nil
}

// processKillByName terminates all processes matching a name
func processKillByName(name string) (string, error) {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Windows: use taskkill by name
		cmd = exec.Command("taskkill", "/F", "/IM", name)
	} else {
		// Linux/Unix: use pkill
		cmd = exec.Command("pkill", "-9", name)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to kill processes named %s: %v - %s", name, err, string(output))
	}

	return fmt.Sprintf("Successfully killed processes named %s", name), nil
}

// processStart starts a new process
func processStart(command string, background bool) (string, error) {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		if background {
			// Start detached process on Windows
			cmd = exec.Command("cmd", "/C", "start", "/B", command)
		} else {
			cmd = exec.Command("cmd", "/C", command)
		}
	} else {
		if background {
			// Start detached process on Unix
			cmd = exec.Command("nohup", "sh", "-c", command, "&")
		} else {
			cmd = exec.Command("sh", "-c", command)
		}
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to start process: %v - %s", err, string(output))
	}

	result := "Process started successfully"
	if len(output) > 0 {
		result += fmt.Sprintf("\nOutput: %s", string(output))
	}

	return result, nil
}

// processInfo gets detailed information about a specific process
func processInfo(pid string) (string, error) {
	// Validate PID
	if _, err := strconv.Atoi(pid); err != nil {
		return "", fmt.Errorf("invalid PID: %s", pid)
	}

	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Windows: use wmic
		cmd = exec.Command("wmic", "process", "where", fmt.Sprintf("ProcessId=%s", pid), "get", "Name,ExecutablePath,CommandLine,CreationDate", "/FORMAT:LIST")
	} else {
		// Linux: use ps with detailed info
		cmd = exec.Command("ps", "-p", pid, "-o", "pid,user,comm,cmd,etime,%cpu,%mem")
	}

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get process info: %v", err)
	}

	return string(output), nil
}
