-- Shift chat: messages, broadcast acks, emoji reactions

CREATE TABLE IF NOT EXISTS vt_shift_messages (
  id                    TEXT PRIMARY KEY,
  shift_session_id      TEXT NOT NULL REFERENCES vt_shift_sessions(id) ON DELETE CASCADE,
  clinic_id             TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE CASCADE,
  sender_id             TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  sender_name           TEXT,
  sender_role           TEXT,
  body                  TEXT NOT NULL DEFAULT '',
  type                  TEXT NOT NULL DEFAULT 'regular'
                          CHECK (type IN ('regular', 'broadcast', 'system')),
  broadcast_key         TEXT,
  system_event_type     TEXT,
  system_event_payload  JSONB,
  room_tag              TEXT,
  is_urgent             BOOLEAN NOT NULL DEFAULT FALSE,
  mentioned_user_ids    JSONB NOT NULL DEFAULT '[]'::JSONB,
  pinned_at             TIMESTAMPTZ,
  pinned_by_user_id     TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vt_shift_messages_shift_idx   ON vt_shift_messages (shift_session_id);
CREATE INDEX IF NOT EXISTS vt_shift_messages_clinic_idx  ON vt_shift_messages (clinic_id);
CREATE INDEX IF NOT EXISTS vt_shift_messages_created_idx ON vt_shift_messages (created_at);

CREATE TABLE IF NOT EXISTS vt_shift_message_acks (
  message_id    TEXT NOT NULL REFERENCES vt_shift_messages(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES vt_users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('acknowledged', 'snoozed')),
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS vt_shift_message_reactions (
  message_id  TEXT NOT NULL REFERENCES vt_shift_messages(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES vt_users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);
