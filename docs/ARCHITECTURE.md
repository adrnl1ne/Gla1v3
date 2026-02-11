# Architecture Overview

Gla1v3 is built as a microservices architecture with containerized components working together to provide command and control capabilities with integrated EDR monitoring.

## System Components

The platform consists of six main components:

- **[Frontend](architecture/FRONTEND.md)** - React-based dashboard for operator interaction
- **[Backend](architecture/BACKEND.md)** - Node.js API server handling agent communication and task management
- **[Agents](architecture/AGENTS.md)** - Go-based cross-platform agents deployed on target systems
- **[CA Service](architecture/CA_SERVICE.md)** - Dynamic certificate generation for secure agent communications
- **[Traefik](architecture/TRAEFIK.md)** - Reverse proxy handling TLS termination and routing
- **[Wazuh](architecture/WAZUH.md)** - Integrated EDR for threat detection and monitoring

## Communication Flow

All services communicate through encrypted channels with authentication required at every layer:

1. **Operators** access the Frontend via HTTPS
2. **Frontend** communicates with Backend via authenticated REST API
3. **Agents** establish mTLS connections to Backend through Traefik
4. **Backend** queries Wazuh through the EDR proxy
5. **CA Service** generates certificates on-demand for new agents

## Network Architecture

Services are organized in Docker networks with controlled access:

- Public-facing: Traefik (ports 80, 443)
- Internal: Backend, Frontend, CA Service
- EDR Network: Wazuh stack with dedicated network segment
