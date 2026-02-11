# Backend

The Gla1v3 backend is a Node.js API server that handles agent communication, task management, authentication, and EDR integration.

## Stack

- **Runtime**: Node.js
- **Framework**: Express
- **Authentication**: JWT with bcrypt password hashing
- **TLS**: Mutual TLS for agent connections
- **Logging**: Winston with audit trail support

## API Endpoints

### Authentication (`/api/auth`)
- `POST /login` - User authentication
- `POST /register` - User registration (admin only)

### Agents (`/api/agents`)
- `GET /` - List all agents
- `GET /:id` - Get agent details
- `POST /register` - Agent registration endpoint
- `GET /:id/tasks` - Get tasks for specific agent

### Tasks (`/api/tasks`)
- `POST /` - Create new task
- `GET /` - List all tasks
- `GET /:id` - Get task details
- `PUT /:id/result` - Submit task result

### Build (`/api/build`)
- `POST /agent` - Build new agent with configuration

### EDR (`/api/edr`)
- `POST /query` - Query EDR system
- `GET /alerts` - Retrieve EDR alerts

## Services Layer

- **agentService**: Agent lifecycle, status tracking, metadata management
- **taskService**: Task creation, assignment, result processing
- **authService**: User authentication, JWT generation, credential validation
- **edrService**: EDR integration, alert correlation, query proxy

## Security Features

- JWT authentication on all protected routes
- Role-based access control (RBAC)
- Mutual TLS verification for agent connections
- Request validation and sanitization
- Comprehensive audit logging
- Secure credential storage

## Data Storage

Currently uses in-memory data structures for simplicity in testing environments. Designed for easy migration to persistent database (MongoDB, PostgreSQL, etc.).
