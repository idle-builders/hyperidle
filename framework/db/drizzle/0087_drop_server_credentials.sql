-- @lore The server-side credential surface is deleted — routes, the
-- @hyperidle/credentials package and this table. Only two names ever lived
-- here (`shared_backend_key`, now the desktop keychain's; and
-- `notifications_smtp_password`, which never had a writer). No deployments
-- exist, so this is a plain drop with no data move.
DROP TABLE IF EXISTS "server_credentials";
