-- The system actor now speaks in threads (notices to people); people read its name as the sender.
UPDATE users SET name = 'HyperIdle' WHERE id = 'system:propagation';
