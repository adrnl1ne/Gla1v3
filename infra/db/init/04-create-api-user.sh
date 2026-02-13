#!/bin/bash
# Wrapper script to create gla1v3_api user with password from environment
# This runs during PostgreSQL initialization

set -e

echo "Creating gla1v3_api user with password from POSTGRES_PASSWORD..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create non-privileged application user for Row-Level Security
    -- gla1v3_app remains as superuser (for migrations/admin only)
    -- gla1v3_api is the user the backend application uses
    
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gla1v3_api') THEN
            CREATE ROLE gla1v3_api WITH LOGIN PASSWORD '$POSTGRES_PASSWORD';
            RAISE NOTICE 'Created gla1v3_api user';
        ELSE
            -- Update password if user exists (useful for password rotation)
            ALTER ROLE gla1v3_api WITH PASSWORD '$POSTGRES_PASSWORD';
            RAISE NOTICE 'Updated gla1v3_api password';
        END IF;
    END \$\$;
    
    -- Grant necessary privileges (idempotent - safe to run multiple times)
    GRANT CONNECT ON DATABASE gla1v3 TO gla1v3_api;
    GRANT USAGE, CREATE ON SCHEMA public TO gla1v3_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gla1v3_api;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO gla1v3_api;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gla1v3_api;
    
    -- Set default privileges for future objects
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gla1v3_api;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO gla1v3_api;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO gla1v3_api;
EOSQL

echo "✅ gla1v3_api user ready"
