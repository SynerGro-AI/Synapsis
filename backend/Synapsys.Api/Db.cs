using Microsoft.Data.Sqlite;

namespace Synapsys.Api;

public static class Db
{
    private static string _connectionString = "";

    public static void Init(string path)
    {
        _connectionString = $"Data Source={path}";
        using var conn = Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                current_lesson INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS progress (
                user_id INTEGER NOT NULL REFERENCES users(id),
                lesson_id INTEGER NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                sketch TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, lesson_id)
            );
            """;
        cmd.ExecuteNonQuery();
    }

    public static SqliteConnection Open()
    {
        var conn = new SqliteConnection(_connectionString);
        conn.Open();
        return conn;
    }
}
