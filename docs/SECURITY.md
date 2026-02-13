# Security

Gla1v3 implements multiple layers of security to protect both the C2 infrastructure and operational security during penetration testing engagements.

## Authentication & Authorization

### User Authentication
- JWT-based authentication with secure token generation
- Bcrypt password hashing with strong salt rounds
- Role-based access control (RBAC)
- Token expiration and refresh mechanisms

### Agent Authentication
- Mutual TLS (mTLS) with certificate-based authentication
- Unique client certificates per agent
- Certificate CN used as agent identifier
- CA-signed certificates with validation

## Encryption

### Transport Security
- TLS 1.3 for all communications
- Strong cipher suites only
- Certificate pinning for agent connections
- No plaintext traffic allowed

### Data at Rest
- Sensitive configuration encrypted
- Secure credential storage
- Certificate and key protection

## Access Control

### Dashboard Access
- JWT authentication required for all API endpoints
- Session management with token refresh
- Failed login attempt tracking
- Account lockout policies (future enhancement)

### Agent Communication
- mTLS required for all agent connections
- Client certificate validation
- Certificate revocation support (future)

## Audit Logging

Comprehensive logging of all security-relevant events:
- User authentication attempts
- Agent registration and activity
- Task creation and execution
- EDR queries and alert access
- Configuration changes
- Failed authentication attempts

## Network Security

### Segmentation
- Docker networks for service isolation
- Public-facing services behind Traefik proxy
- EDR on dedicated network segment
- No direct backend access from internet

### Firewall Configuration
- Only necessary ports exposed (80, 443)
- All other services internal to Docker networks
- Host firewall recommended for production

## Operational Security

### Before Deployment
- Change all default credentials
- Generate strong random passwords
- Review and understand all components
- Configure proper network segmentation
- Enable monitoring and alerting
- Restrict access to authorized personnel

### During Operations
- Use strong agent beacon intervals
- Rotate credentials regularly
- Monitor for compromise indicators
- Maintain operational logs
- Follow responsible disclosure practices

### After Engagement
- Remove all deployed agents
- Rotate all credentials
- Review audit logs
- Document findings securely
- Destroy sensitive data per policy

## Threat Model

### Assumptions
- Operator workstation is trusted
- Target environment may be hostile
- Network traffic may be monitored
- EDR systems actively detecting

### Protections
- Encrypted C2 communications
- Agent identity isolation
- No credential transmission in clear
- Defensive attribution techniques

## Security Best Practices

1. **Always operate within authorized scope**
2. **Change default credentials immediately**
3. **Use isolated test environments**
4. **Enable audit logging**
5. **Protect CA private keys**
6. **Rotate certificates periodically**
7. **Monitor for anomalous activity**
8. **Follow responsible disclosure**

## Known Limitations

- In-memory data storage (no persistence protection)
- Self-signed certificates (trust on first use)
- No certificate revocation mechanism (yet)
- Basic user management (no advanced RBAC)
- Limited rate limiting (future enhancement)

## Compliance Considerations

When using Gla1v3 in regulated environments:
- Maintain authorization documentation
- Log all activities for audit
- Follow data handling policies
- Implement data retention policies
- Respect privacy regulations
- Document scope boundaries

---

**Remember**: Gla1v3 is a penetration testing tool. Unauthorized access to computer systems is illegal. Always ensure proper authorization before deploying agents or conducting security assessments.
