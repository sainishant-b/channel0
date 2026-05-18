#!/usr/bin/env bash
#
# Provision the Appwrite database used by Watch Party.
#
# Reads credentials from `../../.appwrite-key` (gitignored). Create that
# file by copying `.appwrite-key.example` and filling in your values.
#
# Idempotency: running twice will fail on the second run because the
# collections already exist. Safe to re-run only against an empty
# database. For a clean reset, delete collections first via the Appwrite
# console or `reset.sh`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="$SCRIPT_DIR/../../.appwrite-key"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "ERROR: $KEY_FILE not found. Copy .appwrite-key.example and fill in values." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$KEY_FILE"

: "${APPWRITE_ENDPOINT:?APPWRITE_ENDPOINT not set}"
: "${APPWRITE_PROJECT_ID:?APPWRITE_PROJECT_ID not set}"
: "${APPWRITE_DATABASE_ID:?APPWRITE_DATABASE_ID not set}"
: "${APPWRITE_API_KEY:?APPWRITE_API_KEY not set}"

BASE="$APPWRITE_ENDPOINT/databases/$APPWRITE_DATABASE_ID/collections"
H_PROJECT="X-Appwrite-Project: $APPWRITE_PROJECT_ID"
H_KEY="X-Appwrite-Key: $APPWRITE_API_KEY"
H_JSON="Content-Type: application/json"

aw_post() {
  curl -fsS -X POST -H "$H_PROJECT" -H "$H_KEY" -H "$H_JSON" "$1" -d "$2"
}

create_collection() {
  local id="$1" name="$2"
  echo ">>> Collection: $id"
  aw_post "$BASE" "{
    \"collectionId\": \"$id\",
    \"name\": \"$name\",
    \"permissions\": [\"read(\\\"any\\\")\", \"create(\\\"users\\\")\", \"update(\\\"users\\\")\", \"delete(\\\"users\\\")\"],
    \"documentSecurity\": true
  }" >/dev/null
}

attr_string()   { aw_post "$BASE/$1/attributes/string"   "{\"key\":\"$2\",\"size\":$3,\"required\":$4}" >/dev/null; echo "  + string $2"; }
attr_string_n() { aw_post "$BASE/$1/attributes/string"   "{\"key\":\"$2\",\"size\":$3,\"required\":false,\"default\":null}" >/dev/null; echo "  + string $2 (nullable)"; }
attr_int()      { aw_post "$BASE/$1/attributes/integer"  "{\"key\":\"$2\",\"required\":$3}" >/dev/null; echo "  + int $2"; }
attr_int_n()    { aw_post "$BASE/$1/attributes/integer"  "{\"key\":\"$2\",\"required\":false,\"default\":null}" >/dev/null; echo "  + int $2 (nullable)"; }
attr_dt()       { aw_post "$BASE/$1/attributes/datetime" "{\"key\":\"$2\",\"required\":$3}" >/dev/null; echo "  + datetime $2"; }
attr_dt_n()     { aw_post "$BASE/$1/attributes/datetime" "{\"key\":\"$2\",\"required\":false,\"default\":null}" >/dev/null; echo "  + datetime $2 (nullable)"; }
attr_enum()     { aw_post "$BASE/$1/attributes/enum"     "{\"key\":\"$2\",\"elements\":$3,\"required\":$4}" >/dev/null; echo "  + enum $2"; }

mk_index() {
  local col="$1" key="$2" type="$3" attrs="$4" orders="$5"
  aw_post "$BASE/$col/indexes" "{\"key\":\"$key\",\"type\":\"$type\",\"attributes\":$attrs,\"orders\":$orders}" >/dev/null
  echo "  ~ index $key"
}

# ---------- channels ----------
create_collection channels "Channels"
attr_string   channels code 8 true
attr_string   channels name 60 true
attr_string_n channels description 280
attr_enum     channels visibility '["public","private"]' true
attr_string   channels hostUserId 64 true
attr_string   channels hostUsername 32 true
attr_enum     channels state '["playing","paused","stopped"]' true
attr_int      channels currentVideoIndex true
attr_dt_n     channels currentVideoStartedAt
attr_int      channels pauseAccumMs true
attr_dt_n     channels pausedAt
attr_int      channels viewerCount true
attr_dt       channels createdAt true

# ---------- playlist_items ----------
create_collection playlist_items "Playlist Items"
attr_string playlist_items channelId 32 true
attr_int    playlist_items position true
attr_string playlist_items videoId 32 true
attr_string playlist_items videoTitle 200 true
attr_int_n  playlist_items videoDuration
attr_dt     playlist_items addedAt true

# ---------- chat_messages ----------
create_collection chat_messages "Chat Messages"
attr_string chat_messages channelId 32 true
attr_string chat_messages userId 64 true
attr_string chat_messages username 32 true
attr_string chat_messages text 300 true
attr_dt     chat_messages createdAt true

# ---------- presence ----------
create_collection presence "Presence"
attr_string presence channelId 32 true
attr_string presence userId 64 true
attr_dt     presence lastPing true

echo
echo ">>> Sleeping 8s for attribute processing..."
sleep 8

echo ">>> Indexes"
mk_index channels        code_unique          unique '["code"]'                       '["asc"]'
mk_index channels        host_idx             key    '["hostUserId"]'                 '["asc"]'
mk_index channels        vis_created_idx      key    '["visibility","createdAt"]'     '["asc","desc"]'
mk_index playlist_items  channel_pos_idx      key    '["channelId","position"]'       '["asc","asc"]'
mk_index chat_messages   channel_created_idx  key    '["channelId","createdAt"]'      '["asc","desc"]'
mk_index presence        channel_user_idx     unique '["channelId","userId"]'         '["asc","asc"]'
mk_index presence        lastping_idx         key    '["lastPing"]'                   '["asc"]'

echo
echo ">>> Done."
