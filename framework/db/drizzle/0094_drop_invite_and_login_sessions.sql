-- @lore Nothing can create an invite code or a login session any more: no
-- route, action, tool or command issues either, so a bearer token could
-- never be valid and the X-API-Key is the one credential. Both tables go
-- with every row they hold; the people those rows pointed at stay.

-- 1. sessions a claimed invite issued.
DROP TABLE "login_sessions";
--> statement-breakpoint

-- 2. the invites themselves.
DROP TABLE "invite_codes";
