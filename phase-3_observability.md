Gla1v3 Revamp — Phase 3: Observability
(Week 5–6)

Prerequisite: Phase 2 (Secrets Management) must be complete.

---
Goal

Implement a full metrics, logging, and alerting pipeline using Prometheus, Grafana,
Loki, Promtail, and Alertmanager. All secrets for these services should be sourced
from Vault (established in Phase 2).

---
Tasks

1. Prometheus deployment
   - Add to docker-compose:
       - Prometheus (metrics collection)
       - Node exporter (host metrics)
       - postgres_exporter (Postgres metrics)
       - redis_exporter (Redis metrics)
   - Expose backend /metrics endpoint
   - Configure Prometheus scrape configs for all services
   - Expose Prometheus dashboard at: metrics.gla1v3.local

2. Grafana deployment
   - Add Grafana container
   - Configure Prometheus as datasource
   - Create the following dashboards:
       - C2 beacon metrics (beacon count, latency, agent health)
       - API performance (request rate, error rate, latency)
       - Infrastructure (CPU, memory, disk, network)
       - Database (connections, queries, replication)
   - Enable auto-provisioning for dashboard imports

3. Loki + Promtail for log aggregation
   - Add Loki container
   - Add Promtail as a sidecar per container
   - Configure structured JSON log ingestion
   - Set log retention policy: 30 days
   - Expose Loki at: logs.gla1v3.local

4. Alertmanager integration
   - Add Alertmanager container
   - Configure the following alert routes:
       - Beacon timeout spike (beacon unresponsive > 1 hour)
       - Auth failures > 10/min (potential brute force)
       - Certificate expiry < 7 days
       - Vault unreachable
       - Container restart loops (> 3 restarts in 5 minutes)
   - Configure webhook destination: Slack / Teams / Discord

5. Health check aggregation
   - Centralized health endpoint: health.gla1v3.local
   - Aggregates health status from all services
   - Returns overall system status

---
Critical File Paths

  infra/prometheus.yml
  infra/prometheus/rules/alerts.yml
  infra/prometheus/dashboards/*.json
  infra/loki.yml
  infra/promtail.yml
  infra/alertmanager.yml

---
Verification

1. Access Prometheus:
     http://metrics.gla1v3.local

2. Verify Grafana dashboards are available:
     http://metrics.gla1v3.local  (Grafana)

3. Test alert triggers by simulating a beacon timeout (skip beacons for 1 hour)

4. Verify Loki logs are searchable via Grafana Explore

---
ISO 27001 Controls Addressed

  A.12 — Operations Security
  A.16 — Security Incidents
