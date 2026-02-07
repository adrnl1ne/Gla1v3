# Gla1v3 C2 Framework

A comprehensive Command & Control framework designed for purple team operations, combining offensive agent capabilities with defensive EDR monitoring.

## What is Gla1v3?

Gla1v3 is a web-based platform that lets security teams deploy and manage agents on target systems while simultaneously monitoring detection responses through integrated EDR systems. Think of it as having both the attacker's and defender's view in one place.

**Built for:**
- Red teamers conducting offensive security assessments
- Purple teams validating detection capabilities
- Security researchers testing EDR effectiveness
- Training environments for security practitioners

## Key Features

### Agent Operations
Deploy lightweight Go agents that communicate securely with the C2 server through mutual TLS. Agents can execute commands, enumerate systems, manage files and processes, all while reporting back in real-time.

### Real-Time Dashboard
Monitor all agent activity through a web interface featuring a world map showing agent locations, status tracking, and task management. See exactly where your agents are and what they're doing.

### EDR Integration
Connect multiple EDR systems (Wazuh, CrowdStrike, SentinelOne) to correlate agent actions with security alerts. Understand what gets detected and what doesn't.

### Secure by Design
Every component uses encryption and authentication. Agent communications use mutual TLS, the dashboard requires JWT authentication, and all EDR queries are proxied through authenticated endpoints.

## Documentation

**[Getting Started Guide](docs/GETTING_STARTED.md)** - Setup and first-time configuration

## Architecture at a Glance

Gla1v3 consists of several containerized services working together:

- **Frontend** - React-based dashboard for operator interaction
- **Backend** - Node.js API server handling agent communication and task management
- **CA Service** - Dynamic certificate generation for secure agent communications
- **EDR Proxy** - Authenticated gateway to EDR systems
- **Traefik** - Reverse proxy handling TLS termination and routing
- **Wazuh** - Integrated EDR for threat detection

All services communicate through encrypted channels with authentication required at every layer.

## Security Considerations

**This is a penetration testing tool**. Only use Gla1v3 in authorized environments where you have explicit permission to deploy agents and conduct security testing.

### Built-in Security Features
- Mutual TLS for all agent communications
- JWT-based authentication with role-based access control
- Dynamic certificate generation with automatic expiration
- Encrypted storage of sensitive configuration
- Comprehensive audit logging of all operations

### Before Going Live
- Change all default credentials immediately
- Review the security documentation
- Configure proper network segmentation
- Enable monitoring and alerting
- Restrict access to authorized personnel only

## Technology Stack

- **Frontend**: React + Vite + Leaflet for mapping
- **Backend**: Node.js + Express
- **Agents**: Go for cross-platform compatibility
- **Proxy**: Traefik for advanced routing
- **EDR**: Wazuh with OpenSearch
- **Orchestration**: Docker Compose

## Project Status

Gla1v3 is actively developed and suitable for testing environments. Core features are stable, with continuous improvements to agent capabilities and EDR integrations.

**Current Capabilities:**
- ✅ Agent deployment and management
- ✅ Secure C2 communications via mTLS
- ✅ Real-time dashboard with geolocation
- ✅ Multi-EDR integration capability
- ✅ Task execution and result collection
- ✅ Authentication and access control

**Roadmap:**
- 🔄 Enhanced process injection capabilities
- 🔄 Additional EDR connectors
- 🔄 Advanced persistence mechanisms
- 🔄 Automated attack chains

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by MITRE's Caldera framework
- EDR capabilities powered by Wazuh
- Security frameworks based on MITRE ATT&CK and D3FEND

---

**Warning:** Gla1v3 is designed for authorized security testing only. Unauthorized access to computer systems is illegal. Always ensure you have proper permission before conducting security assessments.
