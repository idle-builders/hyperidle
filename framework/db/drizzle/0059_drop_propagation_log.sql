-- AU44 batch6: drop the propagation_log table (AU20 Ruling 2 affirmed).
-- The retry apparatus, recordPropagationHop, and the 30s heartbeat are gone.
-- propagation_applied / propagation_failed domain events are kept as the
-- extension surface for plugins.
DROP TABLE IF EXISTS "propagation_log";
