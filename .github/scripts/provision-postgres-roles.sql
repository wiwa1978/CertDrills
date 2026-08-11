\set ON_ERROR_STOP on

-- Required psql variables:
--   migration_role, migration_password, runtime_role, runtime_password
-- Run this script as the external PostgreSQL administrator against the app database.
SELECT
  nullif(:'migration_role', '') IS NOT NULL
  AND nullif(:'migration_password', '') IS NOT NULL
  AND nullif(:'runtime_role', '') IS NOT NULL
  AND nullif(:'runtime_password', '') IS NOT NULL AS role_inputs_present,
  :'migration_role' <> :'runtime_role' AS roles_are_distinct,
  :'migration_password' <> :'runtime_password' AS passwords_are_distinct,
  current_user <> :'migration_role'
  AND current_user <> :'runtime_role' AS roles_are_not_administrator
\gset

\if :role_inputs_present
\else
  \echo 'Migration and runtime role names and passwords must all be non-empty.'
  \quit 1
\endif

\if :roles_are_distinct
\else
  \echo 'Migration and runtime role names must be distinct.'
  \quit 1
\endif

\if :passwords_are_distinct
\else
  \echo 'Migration and runtime passwords must be distinct.'
  \quit 1
\endif

\if :roles_are_not_administrator
\else
  \echo 'Application roles must be distinct from the provisioning administrator.'
  \quit 1
\endif

BEGIN;

SELECT format(
  'CREATE ROLE %I LOGIN NOINHERIT PASSWORD %L',
  :'migration_role',
  :'migration_password'
)
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'migration_role')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN NOINHERIT PASSWORD %L',
  :'runtime_role',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOCREATEDB NOCREATEROLE NOINHERIT',
  :'migration_role',
  :'migration_password'
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOCREATEDB NOCREATEROLE NOINHERIT',
  :'runtime_role',
  :'runtime_password'
)
\gexec

SELECT NOT bool_or(rolsuper OR rolreplication OR rolbypassrls) AS roles_are_unprivileged
FROM pg_catalog.pg_roles
WHERE rolname IN (:'migration_role', :'runtime_role')
\gset

\if :roles_are_unprivileged
\else
  \echo 'Migration and runtime roles must not have superuser, replication, or row-security bypass privileges.'
  \quit 1
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
  WHERE member_role.rolname IN (:'migration_role', :'runtime_role')
) AS roles_have_no_memberships
\gset

\if :roles_have_no_memberships
\else
  \echo 'Migration and runtime roles must not inherit or be able to SET ROLE to another role.'
  \quit 1
\endif

-- The administrator needs temporary SET ROLE rights to transfer ownership and
-- configure the migration owner's default privileges. These grants are removed
-- before the script exits.
SELECT format('GRANT %I TO %I', :'migration_role', current_user)
\gexec
SELECT format('GRANT %I TO %I', :'runtime_role', current_user)
\gexec

SELECT format('ALTER SCHEMA public OWNER TO %I', :'migration_role')
\gexec

-- Cleanly adopt objects created by an earlier administrator-backed deployment,
-- and repair any objects accidentally owned by the runtime role.
SELECT format(
  'ALTER %s %I.%I OWNER TO %I',
  CASE c.relkind
    WHEN 'r' THEN 'TABLE'
    WHEN 'p' THEN 'TABLE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    WHEN 'S' THEN 'SEQUENCE'
    WHEN 'f' THEN 'FOREIGN TABLE'
  END,
  n.nspname,
  c.relname,
  :'migration_role'
)
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  AND owner_role.rolname IN (current_user, :'runtime_role')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_class'::regclass
      AND dependency.objid = c.oid
      AND dependency.deptype = 'e'
  )
  AND (
    c.relkind <> 'S'
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_depend AS ownership_dependency
      WHERE ownership_dependency.classid = 'pg_class'::regclass
        AND ownership_dependency.objid = c.oid
        AND ownership_dependency.refclassid = 'pg_class'::regclass
        AND ownership_dependency.deptype IN ('a', 'i')
    )
  )
ORDER BY c.relkind, c.relname
\gexec

SELECT format(
  'ALTER %s %I.%I(%s) OWNER TO %I',
  CASE routine.prokind
    WHEN 'p' THEN 'PROCEDURE'
    WHEN 'a' THEN 'AGGREGATE'
    ELSE 'FUNCTION'
  END,
  namespace.nspname,
  routine.proname,
  pg_catalog.pg_get_function_identity_arguments(routine.oid),
  :'migration_role'
)
FROM pg_catalog.pg_proc AS routine
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
WHERE namespace.nspname = 'public'
  AND owner_role.rolname IN (current_user, :'runtime_role')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_proc'::regclass
      AND dependency.objid = routine.oid
      AND dependency.deptype = 'e'
  )
ORDER BY routine.proname, pg_catalog.pg_get_function_identity_arguments(routine.oid)
\gexec

SELECT format('ALTER TYPE %I.%I OWNER TO %I', namespace.nspname, data_type.typname, :'migration_role')
FROM pg_catalog.pg_type AS data_type
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = data_type.typnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = data_type.typowner
WHERE namespace.nspname = 'public'
  AND data_type.typtype IN ('d', 'e', 'c')
  AND data_type.typrelid = 0
  AND owner_role.rolname IN (current_user, :'runtime_role')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.classid = 'pg_type'::regclass
      AND dependency.objid = data_type.oid
      AND dependency.deptype = 'e'
  )
ORDER BY data_type.typname
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), :'runtime_role')
\gexec
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO %I', current_database(), :'migration_role')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_role')
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', :'runtime_role')
\gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_role')
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'runtime_role')
\gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'runtime_role')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'runtime_role')
\gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'runtime_role')
\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'migration_role',
  :'runtime_role'
)
\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'migration_role',
  :'runtime_role'
)
\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'migration_role',
  :'runtime_role'
)
\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
  :'migration_role',
  :'runtime_role'
)
\gexec

SELECT format('REVOKE %I FROM %I', :'runtime_role', current_user)
\gexec
SELECT format('REVOKE %I FROM %I', :'migration_role', current_user)
\gexec

COMMIT;
