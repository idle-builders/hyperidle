# WebSocket push contract

All real-time endpoints (`/api/ws/*`) deliver updates in same shape as corresponding REST response + `_event: 'update' | 'delete'` field.
