// Audit Logging Middleware
const auditLog = [];

function auditAction(action) {
  return (req, res, next) => {
    const originalJson = res.json;
    res.json = function(data) {
      auditLog.push({
        timestamp: new Date().toISOString(),
        action,
        user: req.user?.userId || 'anonymous',
        ip: req.ip,
        success: res.statusCode < 400,
        statusCode: res.statusCode
      });
      
      return originalJson.call(this, data);
    };
    next();
  };
}

function getAuditLog() {
  return auditLog;
}

module.exports = {
  auditAction,
  getAuditLog
};
