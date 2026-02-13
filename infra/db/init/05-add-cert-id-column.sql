-- Migration: Add cert_id column to agents table for tracking CA-issued certificates
-- This enables dynamic certificate management and revocation

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS cert_id TEXT;

-- Add index for cert_id lookups
CREATE INDEX IF NOT EXISTS idx_agents_cert_id ON agents(cert_id) WHERE cert_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN agents.cert_id IS 'Certificate ID from CA service for dynamic cert management';
