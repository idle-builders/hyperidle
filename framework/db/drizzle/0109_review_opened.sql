-- Tracks when a reviewer has opened a review, so it stops counting as "waiting for you".
-- A reviewer who opens the page has seen it; the need should not nag them after that.
CREATE TABLE review_opened (
  review_message_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL,
  PRIMARY KEY (review_message_id, user_id)
);
