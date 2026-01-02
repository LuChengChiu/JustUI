# Migrations Guide

This document describes storage schema versioning and migration steps for
persisted data. It is intentionally minimal and focused on the permission
cache, which is currently the only storage schema with explicit versioning.

## Storage Keys

- `permissionCacheV1`

## Permission Cache Schema

Current storage payload for `permissionCacheV1`:

```json
{
  "version": 1,
  "entries": {
    "origin:https://source.example->https://target.example": {
      "decision": "ALLOW",
      "timestamp": 1700000000000,
      "expiresAt": 1700864000000,
      "isPersistent": false,
      "metadata": {}
    }
  },
  "stats": {
    "totalEntries": 0,
    "cacheHits": 0,
    "cacheMisses": 0,
    "evictions": 0,
    "storageSync": 0,
    "lastSyncTime": 1700000000000
  }
}
```

Notes:
- The cache is best-effort and non-critical; schema breaks can safely drop data.
- `version` is validated in `PermissionCache.syncFromStorage()`.

## Upgrade Behavior (Current)

If the stored `version` does not match the in-code `CONFIG.VERSION`, the cache
is ignored and the in-memory cache starts empty. This avoids runtime errors
at the cost of losing cached decisions.

## When to Add a Migration

Add a migration when:
- The storage payload changes shape in a way that is not backward compatible.
- Key formats or normalization rules change.
- New required fields are introduced.

## Suggested Migration Strategy

1. Add a new storage key (e.g., `permissionCacheV2`) for incompatible changes.
2. Read the old key, transform data, and write the new schema.
3. Leave the old key in place for one release, then remove it later.
4. Bump `CONFIG.VERSION` and update the migration logic to accept only the
   current schema version.

If the change is backward compatible, you can keep the same storage key and
only bump `CONFIG.VERSION`, with a lightweight data transform.

## Example Migration Steps (Outline)

1. Read `permissionCacheV1`.
2. Validate data and normalize cache keys.
3. Transform entries to the new schema.
4. Write to `permissionCacheV2`.
5. Optionally, remove `permissionCacheV1` after a safe grace period.
