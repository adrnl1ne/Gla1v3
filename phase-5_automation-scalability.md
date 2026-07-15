Gla1v3 Revamp — Phase 5: Automated Certificate Rotation & Scalability
(Week 9–12)

Prerequisite: Phase 4 (Security Hardening & Audit Logging) must be complete.

---
Goal

Operational automation and performance hardening. This phase automates certificate
lifecycle management and introduces scalability improvements for high-concurrency
workloads.

---
Tasks

1. Automated certificate rotation
   - Backend triggers certificate reissue 7 days before expiry
   - Pushes new certificate to agents on next beacon check-in
   - Revokes old certificates via Vault PKI CRL update
   - Implement as a cron job: backend/cron/certRotation.js

2. Database migration automation
   - Implement golang-migrate or Flyway for schema versioning
   - Version-control all migrations
   - Run migrations automatically on deployment
   - Implement rollback capability

3. Beacon buffering
   - Implement Redis Streams for beacon ingest
   - Decouple agent ingest from synchronous database writes
   - Worker pool processes buffered beacons asynchronously

4. WebSocket for real-time dashboard
   - Replace 5-second polling with WebSocket push
   - Add sticky session support for active connections
   - Implement graceful reconnection handling on the client side

5. Connection pooling (pgBouncer)
   - Deploy pgBouncer in transaction pooling mode in front of PostgreSQL
   - Cap backend connections at 100 while supporting 500+ app-level connections
   - Configure pool mode for high concurrency

---
Critical File Paths

  backend/cron/certRotation.js     (new)
  backend/utils/migration.js       (new)
  backend/queue/beaconBuffer.js    (new)
  backend/routes/websocket.js      (updated)
  infra/pgbouncer/                 (new directory)

---
Verification

1. Test certificate rotation:
   - Create a test certificate with a 5-day TTL
   - Confirm the rotation cron triggers reissue before expiry
   - Confirm the old certificate appears in Vault's CRL

2. Verify Redis Streams beacon buffering:
   - Send a burst of beacon check-ins and confirm they queue in Redis Streams
   - Confirm the worker pool drains the queue and writes to Postgres

3. Test WebSocket connection stability:
   - Connect a client to the dashboard WebSocket endpoint
   - Simulate a server restart and verify graceful reconnection

---
ISO 27001 Controls Addressed

  A.12 — Operations Security
  A.14 — System Acquisition & Development
