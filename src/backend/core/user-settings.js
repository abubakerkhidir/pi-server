import path from "path";

const DEFAULT_TOOLS = ["read", "ls", "bash", "find", "grep", "get_search_content"];

/**
 * Get default user settings.
 */
export function getDefaultSettings() {
  return {
    tools_enabled: DEFAULT_TOOLS,
    thinking_lines: 3,
    tool_lines: 5,
    model_id: "",
    send_on_enter: true,
    copy_text_as_plain: true,
    enable_continue: true,
    parse_pdf_as_image: false,
    confirm_title_change: true,
    first_line_title: true,
    llm_title: false,
    system_message: "",
    paste_to_file_length: 0,
    max_image_resolution: 0,
  };
}

/**
 * Parse a setting value from database format.
 */
function parseSettingValue(row) {
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/**
 * Load user settings from database.
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @returns {Object} User settings
 */
export function loadUserSettings(db, userId) {
  const rows = db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId);
  const settings = getDefaultSettings();

  for (const row of rows) {
    settings[row.key] = parseSettingValue(row);
  }

  const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
  if (user) {
    settings.home_dir = user.home_dir || path.join(process.cwd(), "users", user.username);
    settings.username = user.username;
  }

  return settings;
}

/**
 * Save user settings to database.
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @param {Object} settings - Settings to save
 */
export function saveUserSettings(db, userId, settings) {
  const upsert = db.prepare(
    "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
  );

  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      upsert.run(userId, key, JSON.stringify(value));
    }
  });

  transaction();
}
