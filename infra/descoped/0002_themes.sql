-- 0002_themes.sql | Execute apos 0001_initial.sql. D1/SQLite. Artefatos ficam no R2 privado.
CREATE TABLE IF NOT EXISTS wearable_theme_projects (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES organizations(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, description TEXT, license TEXT NOT NULL, rights_proof_ref TEXT, status TEXT NOT NULL DEFAULT 'DRAFT',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wtheme_projects_tenant ON wearable_theme_projects(tenant_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS wearable_theme_releases (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES organizations(id),theme_id TEXT NOT NULL REFERENCES wearable_theme_projects(id),
 version TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN('DRAFT','BUILT','VALIDATED_SIMULATOR','HARDWARE_TESTED','APPROVED','PUBLISHED','DEPRECATED','REVOKED','QUARANTINED')),
 manifest_json TEXT NOT NULL, manifest_sha256 TEXT, signature_key_id TEXT, published_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(theme_id,version));
CREATE INDEX IF NOT EXISTS wtheme_releases_tenant ON wearable_theme_releases(tenant_id,theme_id,state);
CREATE TABLE IF NOT EXISTS wearable_theme_artifacts (
 id TEXT PRIMARY KEY,release_id TEXT NOT NULL REFERENCES wearable_theme_releases(id),kind TEXT NOT NULL CHECK(kind IN('res','preview','manifest','font')),
 r2_key TEXT NOT NULL UNIQUE,sha256 TEXT NOT NULL,size_bytes INTEGER NOT NULL CHECK(size_bytes>0),license TEXT NOT NULL,rights_proof_ref TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wearable_theme_compatibility (
 id TEXT PRIMARY KEY,release_id TEXT NOT NULL REFERENCES wearable_theme_releases(id),variant_code TEXT NOT NULL CHECK(variant_code IN('wuhan','hankou','chongqing')),
 hw_revision TEXT NOT NULL,firmware_version TEXT NOT NULL,driver_min_version TEXT NOT NULL,resource_format_version TEXT NOT NULL,
 hardware_verified INTEGER NOT NULL DEFAULT 0 CHECK(hardware_verified IN(0,1)),evidence_ref TEXT,UNIQUE(release_id,variant_code,hw_revision,firmware_version));
CREATE INDEX IF NOT EXISTS wtheme_compat_lookup ON wearable_theme_compatibility(variant_code,hw_revision,firmware_version,hardware_verified);
CREATE TABLE IF NOT EXISTS wearable_theme_installs (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES organizations(id),device_id TEXT NOT NULL REFERENCES devices(id),
 gateway_id TEXT NOT NULL REFERENCES gateways(id),requested_by_user_id TEXT NOT NULL REFERENCES users(id),
 release_id TEXT NOT NULL REFERENCES wearable_theme_releases(id),attempt_id TEXT NOT NULL,status TEXT NOT NULL,
 local_confirmation_ref TEXT,artifact_sha256 TEXT NOT NULL,firmware_before TEXT,resources_before TEXT,resources_after TEXT,
 error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT,
 UNIQUE(tenant_id,device_id,attempt_id));
CREATE INDEX IF NOT EXISTS wtheme_installs_lookup ON wearable_theme_installs(tenant_id,device_id,created_at DESC);
CREATE TABLE IF NOT EXISTS wearable_theme_events (
 id TEXT PRIMARY KEY,install_id TEXT NOT NULL REFERENCES wearable_theme_installs(id),seq INTEGER NOT NULL CHECK(seq>=0),
 phase TEXT NOT NULL,status TEXT NOT NULL,confirmed_bytes INTEGER,total_bytes INTEGER,error_code TEXT,evidence_ref TEXT,observed_at TEXT NOT NULL,
 UNIQUE(install_id,seq));
CREATE TABLE IF NOT EXISTS wearable_theme_approvals (
 id TEXT PRIMARY KEY,release_id TEXT NOT NULL REFERENCES wearable_theme_releases(id),actor_user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN('TECHNICAL','LEGAL','RELEASE')),evidence_ref TEXT,approved_at TEXT NOT NULL,
 UNIQUE(release_id,actor_user_id,kind));
CREATE TABLE IF NOT EXISTS wearable_theme_revocations (
 id TEXT PRIMARY KEY,release_id TEXT NOT NULL REFERENCES wearable_theme_releases(id),revoked_by_user_id TEXT NOT NULL REFERENCES users(id),
 reason_code TEXT NOT NULL,revoked_at TEXT NOT NULL,UNIQUE(release_id));
