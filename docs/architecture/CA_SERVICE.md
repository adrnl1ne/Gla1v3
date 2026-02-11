# CA Service

The Certificate Authority service dynamically generates client certificates for agents, enabling mutual TLS authentication.

## Technology

- **Runtime**: Node.js
- **Certificate Generation**: OpenSSL via node-forge
- **API**: REST endpoints for certificate requests

## Purpose

Provides on-demand certificate generation for new agents, ensuring each agent has a unique identity for mTLS authentication.

## Certificate Hierarchy

```
Root CA (ca.crt)
└── Agent Certificates (unique CN per agent)
```

## API Endpoints

### `POST /generate-cert`
Generates a new client certificate for an agent.

**Request:**
```json
{
  "cn": "agent-unique-id"
}
```

**Response:**
```json
{
  "cert": "-----BEGIN CERTIFICATE-----...",
  "key": "-----BEGIN PRIVATE KEY-----...",
  "ca": "-----BEGIN CERTIFICATE-----..."
}
```

## Certificate Properties

- **Validity**: 365 days
- **Algorithm**: RSA 2048-bit
- **CN**: Unique agent identifier
- **Issuer**: Gla1v3 CA
- **Usage**: Client authentication

## Integration

1. Operator initiates agent build via dashboard
2. Backend requests certificate from CA service
3. CA service generates unique certificate
4. Certificate embedded in agent binary during compilation
5. Agent uses certificate for mTLS with C2 server

## Security Considerations

- CA private key stored securely in container
- Certificate generation requires authentication
- Each certificate has unique CN for agent identification
- Certificates can be revoked (future enhancement)
