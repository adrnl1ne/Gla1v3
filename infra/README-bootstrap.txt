Overview

This document records the exact steps used to bootstrap OpenSearch security for the local Wazuh stack using the repository CA and certs. It also lists verification steps and the remaining work required to get Filebeat (manager -> indexer) working end-to-end.

Prerequisites
- Docker / Docker Compose set up and the compose file at `infra/docker-compose.yml`.
- Repository certs mounted into containers (the environment in our setup places them under `/etc/ssl/certs` inside containers).
- The indexer image used here is `wazuh/wazuh-indexer:4.8.2` (bundled JDK at `/usr/share/wazuh-indexer/jdk`).

High-level intent
- Replace indexer runtime certs with repo certs so the server cert chain matches the repo CA.
- Ensure `manager-client` certificate is recognized as an admin DN in `opensearch.yml`.
- Create the `securityconfig` directory expected by the `opensearch-security` plugin and populate it with the example YAMLs shipped with the image.
- Run `securityadmin.sh` with the manager-client certificate and the repo CA to populate `.opendistro_security`.

Exact commands used (run inside host shell / powershell from repo root)

1) Copy writable copies of the repo certs into the indexer container (do this as root because mounted keys are often read-only):

```powershell
# copy certs into a writable tmp directory inside the indexer
docker compose -f infra/docker-compose.yml exec -u 0 -T wazuh-indexer sh -c "mkdir -p /tmp/wazuh-certs && cp -f /etc/ssl/certs/ca.crt /etc/ssl/certs/manager-client.crt /etc/ssl/certs/manager-client.key /tmp/wazuh-certs && chmod 600 /tmp/wazuh-certs/manager-client.key && ls -la /tmp/wazuh-certs"
```

Notes: If the private key is mounted read-only, copying it as root into `/tmp` allows changing file mode to `0600` as required by Java/OpenSearch.

2) (Optional) Create a Java truststore from the repo CA for use by Java tools:

```sh
# inside container
/usr/share/wazuh-indexer/jdk/bin/keytool -importcert -file /tmp/wazuh-certs/ca.crt -alias repoCA -keystore /tmp/wazuh-certs/truststore.jks -storepass changeit -noprompt
```

3) Replace runtime indexer certs so the indexer presents repo-signed certs:

```powershell
# on host - copy the repo certs into the runtime certs path used by the image
# do this as root inside container if needed
docker compose -f infra/docker-compose.yml exec -u 0 -T wazuh-indexer sh -c "cp -f /tmp/wazuh-certs/manager-client.crt /usr/share/wazuh-indexer/certs/indexer.pem && cp -f /tmp/wazuh-certs/manager-client.key /usr/share/wazuh-indexer/certs/indexer-key.pem && cp -f /tmp/wazuh-certs/ca.crt /usr/share/wazuh-indexer/certs/root-ca.pem && chown wazuh-indexer:wazuh-indexer /usr/share/wazuh-indexer/certs/* && chmod 600 /usr/share/wazuh-indexer/certs/*"

# restart indexer so it loads new certs
docker compose -f infra/docker-compose.yml restart wazuh-indexer
```

4) Ensure `manager-client` is listed as an admin DN in `opensearch.yml` (the plugin reads this setting):

- Edit `/usr/share/wazuh-indexer/opensearch.yml` inside the container (or prepare a fixed copy and `docker cp`) and add under `plugins.security.authcz.admin_dn:` an entry:

```yaml
plugins.security.authcz.admin_dn:
  - "CN=admin,OU=Wazuh,O=Wazuh,L=California,C=US"
  - "CN=manager-client,OU=Wazuh,O=Wazuh,L=California,C=US"
```

Caution: avoid ad-hoc `sed`/`awk` appends that can corrupt YAML indentation — prefer copying a vetted file into place or editing with an editor.

5) Populate the `securityconfig` directory expected by the `opensearch-security` plugin (securityadmin requires these YAMLs):

```sh
# inside indexer container
mkdir -p /usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig
cp -f /usr/share/wazuh-indexer/opensearch-security/*.yml /usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig/
chown -R wazuh-indexer:wazuh-indexer /usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig
```

6) Run the packaged `securityadmin.sh` tool to upload configs and create `.opendistro_security`:

```sh
# inside indexer container (as root)
OPENSEARCH_JAVA_HOME=/usr/share/wazuh-indexer/jdk \
/usr/share/wazuh-indexer/plugins/opensearch-security/tools/securityadmin.sh \
  -cd "/usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig" \
  -cacert "/tmp/wazuh-certs/ca.crt" \
  -cert "/tmp/wazuh-certs/manager-client.crt" \
  -key "/tmp/wazuh-certs/manager-client.key" \
  -nhnv -icl -h 127.0.0.1 -p 9200
```

Expected output: securityadmin prints `Connected as 'CN=manager-client'` then `SUCC` messages for each config type and `Done with success`.

7) Verify the REST endpoint requires auth (indicates security is active):

```sh
# from indexer container
curl -vk --cacert /tmp/wazuh-certs/ca.crt https://127.0.0.1:9200/
# expected: HTTP/1.1 401 Unauthorized
```

8) Restart `wazuh-manager` once security is initialized so Filebeat re-connects:

```powershell
docker compose -f infra/docker-compose.yml restart wazuh-manager
```

Verification checklist
- OpenSearch cluster health should become GREEN (indexer logs show cluster state changes). Example log lines: `cluster health status changed from [RED] to [GREEN]`.
- `securityadmin.sh` run should indicate SUCC for all config types and `.opendistro_security` modules should be referenced in logs.
- `curl --cacert /tmp/wazuh-certs/ca.crt https://127.0.0.1:9200/` returns `401 Unauthorized` (means security is enabled).

Cleanup performed by me
- Removed local temporary files used only for debugging: `infra/tmp_admin_block.txt`, `infra/opensearch.yml.fixed`, `infra/opensearch.yml.fixed2`, `infra/opensearch.yml.container_copy`.
- Removed the corresponding temporary files inside the `wazuh-indexer` container: `/tmp/admin_block.txt`, `/tmp/patch_opensearch.sh`, `/tmp/run_securityadmin.sh`, `/tmp/opensearch.yml.bak`.
- Left `/tmp/wazuh-certs` in the indexer container intact because it contains the repo certs and the truststore and is useful for repeating the bootstrap.

Remaining actions required to get Filebeat (manager -> indexer) working end-to-end

1) Fix DNS / hostname resolution for `demo.indexer` from the manager container
- Logs show: `lookup demo.indexer on 127.0.0.11:53: no such host`.
- Options:
  - Add a stable service name / network alias in `infra/docker-compose.yml` for the `wazuh-indexer` service (preferred), or
  - Add a temporary `/etc/hosts` entry inside the manager container pointing `demo.indexer` to the indexer IP using:

```powershell
# get indexer container IP (host)
docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" $(docker compose -f infra/docker-compose.yml ps -q wazuh-indexer)
# then inside manager container add hosts entry (as root)
docker compose -f infra/docker-compose.yml exec -u 0 wazuh-manager sh -c "echo '172.18.0.5 demo.indexer' >> /etc/hosts"
```

2) Restore the missing Filebeat template file inside `wazuh-manager`
- Logs show: `error loading template: stat /etc/filebeat/wazuh-template.json: no such file or directory` — Filebeat fails its onConnect callback because the expected template is missing.
- Place the correct `wazuh-template.json` into `/etc/filebeat/` inside the manager container (either by mounting it in compose or copying it into the running container):

```powershell
# copy from host to manager container
docker cp path/to/wazuh-template.json $(docker compose -f infra/docker-compose.yml ps -q wazuh-manager):/etc/filebeat/wazuh-template.json
# restart manager
docker compose -f infra/docker-compose.yml restart wazuh-manager
```

If you don't have `wazuh-template.json`, fetch the correct template for the used Filebeat/Wazuh version or export it from a known-good deployment.

3) Confirm Filebeat TLS settings
- Ensure Filebeat in `wazuh-manager` is configured to use the repo CA for verification and, if using client certs, to present the manager-client cert/key. Check Filebeat `output.elasticsearch` TLS options in the manager config (or `filebeat.yml`), and that the certificate hostnames match the `demo.indexer` DNS name or the certificate SANs.

4) Harden file permissions (optional but recommended)
- OpenSearch security plugin warns about insecure file permissions in several paths. It's advisable to set stricter permissions on certs and plugin folders inside the indexer image. Example (inside indexer container):

```sh
chown -R wazuh-indexer:wazuh-indexer /usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig
chmod 700 /usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig
chmod 600 /usr/share/wazuh-indexer/certs/*
```

Notes & gotchas
- Do not attempt to chmod files that are mounted read-only from the host; instead copy the files into a writable location inside container (e.g., `/tmp`), adjust permissions, then move them into the runtime location as root.
- Avoid ad-hoc scripted YAML appends to `opensearch.yml`; they can corrupt YAML structure and prevent the indexer from starting. Use vetted files and `docker cp` to replace when necessary.

If you want, I can:
- Apply a temporary `/etc/hosts` mapping inside `wazuh-manager` so `demo.indexer` resolves and re-tail logs to confirm Filebeat connects, and/or
- Copy a provided `wazuh-template.json` into the manager container and restart it to validate the template-loading step.

Contact
- This file was generated automatically by the bootstrap session run on 2025-12-03.
