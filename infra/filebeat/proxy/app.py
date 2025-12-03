from flask import Flask, request, Response
import requests
import os

app = Flask(__name__)

# Upstream indexer we forward to
UPSTREAM = os.environ.get("UPSTREAM_INDEXER", "https://demo.indexer:9200")
CERT = "/etc/ssl/certs/manager-client.crt"
KEY = "/etc/ssl/certs/manager-client.key"
CA = "/etc/ssl/certs/ca.crt"


@app.route('/_license', methods=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'])
def license():
    # Return a minimal OK response so Filebeat's license/version check succeeds
    payload = '{"license": {}}'
    return Response(payload, status=200, mimetype='application/json')


@app.route('/', defaults={'path': ''}, methods=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'])
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'])
def proxy(path):
    # Forward everything else to the real indexer using mTLS
    url = f"{UPSTREAM}/{path}"
    if request.query_string:
        url = url + '?' + request.query_string.decode('utf-8')

    try:
        resp = requests.request(
            method=request.method,
            url=url,
            headers={k: v for k, v in request.headers if k.lower() != 'host'},
            data=request.get_data(),
            stream=True,
            verify=CA,
            cert=(CERT, KEY),
            timeout=10,
        )

        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = [(name, value) for (name, value) in resp.raw.headers.items() if name.lower() not in excluded_headers]
        return Response(resp.content, resp.status_code, headers)
    except requests.RequestException as e:
        return Response(f'upstream error: {e}', status=502)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9200, debug=False)
