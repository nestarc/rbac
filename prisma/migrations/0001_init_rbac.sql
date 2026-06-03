CREATE TABLE IF NOT EXISTS rbac_roles (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  name TEXT,
  description TEXT,
  tenant_id TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rbac_permissions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT rbac_role_permissions_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES rbac_roles (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT rbac_role_permissions_permission_id_fkey
    FOREIGN KEY (permission_id)
    REFERENCES rbac_permissions (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS rbac_role_bindings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rbac_role_bindings_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES rbac_roles (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_permissions_key_unique
  ON rbac_permissions (key);

CREATE UNIQUE INDEX IF NOT EXISTS rbac_roles_global_key_unique
  ON rbac_roles (key)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_roles_tenant_key_unique
  ON rbac_roles (tenant_id, key)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rbac_active_binding_unique
  ON rbac_role_bindings (
    COALESCE(tenant_id, ''),
    subject_type,
    subject_id,
    role_id,
    COALESCE(resource_type, ''),
    COALESCE(resource_id, '')
  )
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS rbac_active_subject_lookup_idx
  ON rbac_role_bindings (tenant_id, subject_type, subject_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS rbac_role_permissions_permission_idx
  ON rbac_role_permissions (permission_id);
