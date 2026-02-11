# Frontend

The Gla1v3 frontend is a React-based single-page application that provides the operator interface for managing agents and viewing EDR data.

## Technology

- **Framework**: React 18
- **Build Tool**: Vite
- **Mapping**: Leaflet for agent geolocation visualization
- **Styling**: Custom CSS with DEDSEC-inspired design theme

## Key Components

### Dashboard
Main view showing agent status, world map, and activity overview.

### Agent Management
Interface for building new agents, configuring beacon intervals, and selecting embedded tasks.

### Task Panel
Execute commands, create custom tasks, and view task history and results.

### EDR Manager
Query and visualize alerts from connected EDR systems, with agent correlation.

### World Map
Interactive map showing agent locations based on public IP geolocation.

## Architecture

- **Component-based**: Modular React components for maintainability
- **State Management**: Props and context for data flow
- **API Communication**: Fetch API with JWT authentication
- **Real-time Updates**: Polling-based refresh for agent status

## Build Process

Frontend is containerized using multi-stage Docker build:
1. Build static assets with Vite
2. Serve via lightweight nginx container
3. Accessed through Traefik reverse proxy at `dashboard.gla1v3.local`
