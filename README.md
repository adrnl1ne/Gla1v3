# Gla1v3 C2 Framework

A comprehensive Command & Control framework designed for purple team operations, combining offensive agent capabilities with extensible SIEM/EDR integration.

## What is Gla1v3?

Gla1v3 is a web-based platform that lets security teams deploy and manage agents on target systems while simultaneously monitoring detection responses through integrated security tools. Think of it as having both the attacker's and defender's view in one place.

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

### SIEM/EDR Integration
Connect external SIEM and EDR systems to correlate agent actions with security alerts. The platform supports flexible integration with various security monitoring solutions.

### Secure by Design
Every component uses encryption and authentication. Agent communications use mutual TLS, the dashboard requires JWT authentication, and all EDR queries are proxied through authenticated endpoints.

## Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** - Setup and first-time configuration
- **[Architecture](docs/ARCHITECTURE.md)** - System design and components
- **[Security](docs/SECURITY.md)** - Security features and best practices
- **[Security Limitations](docs/SECURITY_LIMITATIONS.md)** - Token/certificate management and limitations

### Developer Docs
- **[Agents Build Guide](docs/developer/AGENTS_BUILD.md)** - Building and deploying agents
- **[Agent Modules](docs/developer/AGENT_MODULES.md)** - Agent package structure and extensibility
- **[Task Reference](docs/developer/TASK_REFERENCE.md)** - Complete agent task API
- **[Features Roadmap](docs/developer/FEATURES_ROADMAP.md)** - Planned agent enhancements

### Architecture Details
- **[Agents](docs/architecture/AGENTS.md)** - Agent lifecycle and capabilities
- **[Backend](docs/architecture/BACKEND.md)** - API server architecture
- **[Frontend](docs/architecture/FRONTEND.md)** - Dashboard UI components
- **[CA Service](docs/architecture/CA_SERVICE.md)** - Certificate authority
- **[Traefik](docs/architecture/TRAEFIK.md)** - Reverse proxy configuration

### API Reference
- **[Tenants API](docs/api/tenants.md)** - Multi-tenant API documentation

## Project Status

Gla1v3 is actively developed and suitable for testing environments. Core features are stable, with continuous improvements to agent capabilities and EDR integrations.

**CI & coverage**

- Backend unit tests run on push/PR via GitHub Actions (`.github/workflows/test-backend.yml`).
- Coverage is uploaded to Codecov (project target: **60%** for services).

Badges:

- Coverage badge:
  [![codecov](https://codecov.io/gh/adrnl1ne/Gla1v3/branch/main/graph/badge.svg?token=DFME9ITWLN)](https://codecov.io/gh/adrnl1ne/Gla1v3)


**Current Capabilities:**
- ✅ Agent deployment and management
- ✅ Secure C2 communications via mTLS
- ✅ Real-time dashboard with geolocation
- ✅ SIEM/EDR integration capability
- ✅ Task execution and result collection
- ✅ Authentication and access control

**Roadmap:**
- 🔄 Enhanced process injection capabilities
- 🔄 Additional SIEM/EDR connectors
- 🔄 Advanced persistence mechanisms
- 🔄 Automated attack chains

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by MITRE's Caldera framework
- Security frameworks based on MITRE ATT&CK and D3FEND

---

**Warning:** Gla1v3 is designed for authorized security testing only. Unauthorized access to computer systems is illegal. Always ensure you have proper permission before conducting security assessments.
