# Traefik

Traefik acts as the reverse proxy and edge router for Gla1v3, handling TLS termination, routing, and load balancing.

## Technology

- **Proxy**: Traefik v2
- **Configuration**: File-based (static + dynamic)
- **TLS**: Automatic certificate management
- **Routing**: Host-based and path-based

## Routing Rules

### Dashboard (`dashboard.gla1v3.local`)
Routes to frontend container for operator web interface.

### C2 Server (`c2.gla1v3.local`)
Routes to backend container for agent communication.

### CA Service (`ca.gla1v3.local`)
Routes to CA service for certificate generation.

## TLS Configuration

- **TLS Version**: 1.2 minimum, 1.3 preferred
- **Certificates**: Self-signed in test environment
- **Client Auth**: Required for agent connections (mTLS)
- **Ciphers**: Strong cipher suites only

## Features

### TLS Termination
Handles SSL/TLS for all incoming connections, offloading encryption from backend services.

### Client Certificate Validation
Validates agent client certificates against CA for mutual TLS authentication.

### Host-Based Routing
Routes requests based on hostname to appropriate backend service.

### Health Checks
Monitors backend service health and routes traffic only to healthy instances.

## Configuration Files

- **traefik.yml**: Static configuration (entry points, providers)
- **dynamic.yml**: Dynamic configuration (routers, services, middlewares)

## Integration

1. All external traffic enters through Traefik (ports 80, 443)
2. HTTPS redirect enforced (80 → 443)
3. Host header determines routing destination
4. TLS termination and validation performed
5. Request forwarded to backend service
6. Response returned through Traefik to client

## Security

- Automatic HTTPS redirect
- Client certificate validation for agents
- No direct access to backend services
- Centralized access logging
