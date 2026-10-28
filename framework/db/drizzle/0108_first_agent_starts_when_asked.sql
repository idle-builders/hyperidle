-- First start gave the first agent a reason to start on every change anywhere: the nine object
-- events, unscoped, with nothing written for what to do. It started the agent beside every reply
-- it was already giving, and on its own messages. Remove exactly that set. A reason someone wrote
-- for an agent has its own document under it and stays; a person's notifications stay.
DELETE FROM "subscriptions" s
 USING "users" u
 WHERE u."id" = s."user_id"
   AND u."kind" = 'ai'
   AND s."object_id" IS NULL
   AND s."schedule" IS NULL
   AND s."event" IN ('task.created', 'task.changed', 'thread.created', 'thread.message', 'thread.changed',
                     'document.created', 'document.changed', 'user.created', 'user.changed')
   AND NOT EXISTS (
     SELECT 1 FROM "documents" d WHERE d."parent_kind" = 'subscription' AND d."parent_id" = s."id"
   )
   AND (
     SELECT count(DISTINCT s2."event") FROM "subscriptions" s2
      WHERE s2."user_id" = s."user_id" AND s2."object_id" IS NULL AND s2."schedule" IS NULL
        AND s2."event" IN ('task.created', 'task.changed', 'thread.created', 'thread.message', 'thread.changed',
                           'document.created', 'document.changed', 'user.created', 'user.changed')
   ) = 9;
