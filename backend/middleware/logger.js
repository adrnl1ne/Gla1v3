// Request Logging Middleware
function requestLogger(req, res, next) {
  console.log(`\nINCOMING → ${req.method} ${req.url} on port ${req.socket.localPort}`);
  console.log('HEADERS:', req.headers);
  next();
}

module.exports = { requestLogger };
