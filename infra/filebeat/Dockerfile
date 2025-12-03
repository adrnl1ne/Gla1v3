FROM debian:bookworm-slim

ARG FILEBEAT_VERSION=8.10.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tar gnupg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /usr/share/filebeat

RUN curl -sSL "https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-${FILEBEAT_VERSION}-linux-x86_64.tar.gz" -o /tmp/filebeat.tar.gz \
 && tar -xzf /tmp/filebeat.tar.gz -C /tmp \
 && mv /tmp/filebeat-${FILEBEAT_VERSION}-linux-x86_64/* /usr/share/filebeat/ \
 && ln -s /usr/share/filebeat/filebeat /usr/local/bin/filebeat \
 && rm -rf /tmp/filebeat.tar.gz /tmp/filebeat-${FILEBEAT_VERSION}-linux-x86_64

WORKDIR /usr/share/filebeat

ENTRYPOINT ["/usr/local/bin/filebeat"]
CMD ["-e", "-c", "/usr/share/filebeat/filebeat.yml"]
