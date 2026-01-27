# Gla1v3

**A web-based purple teaming platform for managing and deploying agents that execute offensive scenarios while integrating with EDR for defensive analysis.**

## Overview

Gla1v3 combines offensive agent orchestration (inspired by Caldera) with defensive monitoring (Wazuh EDR integration) to create a comprehensive purple teaming platform. Built from scratch with a focus on real-time data collection, secure communications (mTLS), and modern web technologies.

## Features

- 🎯 **Agent Management** - Deploy and control multiple Go-based agents
- 🔐 **Secure C2** - mTLS-enforced command and control
- 🌍 **Real-Time Dashboard** - Live agent tracking with geo-location
- 🛡️ **EDR Integration** - Wazuh integration for detection correlation
- 🐳 **Containerized** - Full Docker environment for portability
- 🔄 **MITRE Framework** - ATT&CK tactics and D3FEND mitigations

## Quick Start

```bash
# Clone the repository
git clone https://github.com/adrnl1ne/Gla1v3.git
cd Gla1v3

# Start the platform
cd infra
docker compose up -d

# Add to hosts file (Windows: C:\Windows\System32\drivers\etc\hosts)
127.0.0.1 gla1v3.local dashboard.gla1v3.local api.gla1v3.local c2.gla1v3.local wazuh.gla1v3.local

# Access dashboard
https://dashboard.gla1v3.local
```

## Architecture

```
┌─────────────┐      mTLS       ┌──────────┐
│  Go Agent   │ ←────────────── │ Traefik  │
└─────────────┘                 │  Proxy   │
                                └────┬─────┘
┌─────────────┐      HTTPS           │
│   Browser   │ ←────────────────────┤
└─────────────┘                      │
                    ┌────────────────┴────────────────┐
                    │                                 │
              ┌─────▼─────┐                    ┌─────▼─────┐
              │  Backend  │ ◄───────────────►  │  Frontend │
              │  (Node)   │                    │  (React)  │
              └─────┬─────┘                    └───────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
    ┌───▼───┐   ┌──▼──┐   ┌───▼────┐
    │ Wazuh │   │ PG  │   │ Redis  │
    └───────┘   └─────┘   └────────┘
```

## Stack

- **Frontend**: React 18 + Vite + Leaflet (maps)
- **Backend**: Node.js + Express
- **Agent**: Go 1.23
- **Proxy**: Traefik v2.10 (mTLS)
- **EDR**: Wazuh 4.8.2
- **Database**: PostgreSQL 16
- **Cache**: Redis 7

## Documentation

- [Project Overview](PROJECT_OVERVIEW.md) - Architecture and services
- [Cleanup Summary](CLEANUP_SUMMARY.md) - Recent changes and fixes
- [Infra Setup](infra/README-bootstrap.txt) - Infrastructure details

## Project Status

**Current Phase:** MVP Development

- ✅ Infrastructure & Docker environment
- ✅ Agent beacon with mTLS
- ✅ Real-time dashboard with world map
- ✅ Wazuh EDR integration (basic)
- 🚧 Agent actions & Wazuh correlation
- 🚧 JWT authentication
- 📋 MITRE ATT&CK/D3FEND mapping

## Development

### Prerequisites
- Docker Desktop
- Node.js 20+ (for local dev)
- Go 1.23+ (for agent dev)

### Run Locally
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev

# Agent
cd agents-go
go run cmd/agent/main.go
```

## Security

⚠️ **Note**: This is a purple teaming platform for authorized testing only. Current implementation uses self-signed certificates and disabled cert verification for MVP. Production deployment requires:

- Proper certificate management
- Session-based cert generation
- Full TLS verification
- JWT authentication
- Network segmentation

## License

MIT License - see [LICENSE](LICENSE)

## Contributing

This is an academic/research project. Contributions welcome!

## Acknowledgments

- Inspired by [Caldera](https://github.com/mitre/caldera) (MITRE)
- EDR integration via [Wazuh](https://wazuh.com/)
- Security frameworks: MITRE ATT&CK & D3FEND

---

Built with ❤️ for purple team operations
