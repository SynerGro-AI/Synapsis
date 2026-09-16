using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Synapsys.Api;

var builder = WebApplication.CreateBuilder(args);

// Allow the Vite dev server to call the API during development.
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "synapsys_auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.ExpireTimeSpan = TimeSpan.FromDays(30);
        options.SlidingExpiration = true;
        // This is an API: return status codes, never redirect to a login page.
        options.Events.OnRedirectToLogin = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

Db.Init(Path.Combine(app.Environment.ContentRootPath, "synapsys.db"));

var dataDir = Path.Combine(AppContext.BaseDirectory, "Data");

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/components", () =>
    Results.Content(File.ReadAllText(Path.Combine(dataDir, "components.json")), "application/json"));

app.MapGet("/api/lessons", () =>
    Results.Content(File.ReadAllText(Path.Combine(dataDir, "lessons.json")), "application/json"));

// ---------- Auth ----------

static async Task SignIn(HttpContext http, long id, string username)
{
    var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, id.ToString()),
            new Claim(ClaimTypes.Name, username),
        ],
        CookieAuthenticationDefaults.AuthenticationScheme);
    await http.SignInAsync(new ClaimsPrincipal(identity));
}

static long UserId(ClaimsPrincipal user) =>
    long.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

app.MapPost("/api/auth/register", async (Credentials creds, HttpContext http) =>
{
    var username = creds.Username?.Trim() ?? "";
    var password = creds.Password ?? "";
    if (username.Length < 3 || username.Length > 32 ||
        !username.All(c => char.IsLetterOrDigit(c) || c is '_' or '-'))
        return Results.Json(
            new { error = "Username must be 3–32 letters, digits, _ or -" },
            statusCode: 400);
    if (password.Length < 8)
        return Results.Json(
            new { error = "Password must be at least 8 characters" },
            statusCode: 400);

    using var conn = Db.Open();
    using (var check = conn.CreateCommand())
    {
        check.CommandText = "SELECT id FROM users WHERE username = $u";
        check.Parameters.AddWithValue("$u", username);
        if (check.ExecuteScalar() is not null)
            return Results.Json(
                new { error = "That username is already taken" },
                statusCode: 409);
    }

    long id;
    using (var insert = conn.CreateCommand())
    {
        insert.CommandText = """
            INSERT INTO users (username, password_hash, created_at)
            VALUES ($u, $p, $t);
            SELECT last_insert_rowid();
            """;
        insert.Parameters.AddWithValue("$u", username);
        insert.Parameters.AddWithValue("$p", PasswordHasher.Hash(password));
        insert.Parameters.AddWithValue("$t", DateTime.UtcNow.ToString("o"));
        id = (long)insert.ExecuteScalar()!;
    }

    await SignIn(http, id, username);
    return Results.Ok(new { username });
});

app.MapPost("/api/auth/login", async (Credentials creds, HttpContext http) =>
{
    var username = creds.Username?.Trim() ?? "";
    using var conn = Db.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT id, username, password_hash FROM users WHERE username = $u";
    cmd.Parameters.AddWithValue("$u", username);
    using var reader = cmd.ExecuteReader();
    if (!reader.Read() ||
        !PasswordHasher.Verify(creds.Password ?? "", reader.GetString(2)))
        return Results.Json(
            new { error = "Wrong username or password" },
            statusCode: 401);

    var id = reader.GetInt64(0);
    var storedName = reader.GetString(1);
    await SignIn(http, id, storedName);
    return Results.Ok(new { username = storedName });
});

app.MapPost("/api/auth/logout", async (HttpContext http) =>
{
    await http.SignOutAsync();
    return Results.NoContent();
});

app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
    Results.Ok(new { username = user.Identity!.Name }))
    .RequireAuthorization();

// ---------- Progress ----------

app.MapGet("/api/progress", (ClaimsPrincipal user) =>
{
    var userId = UserId(user);
    using var conn = Db.Open();

    long currentLesson = 1;
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT current_lesson FROM users WHERE id = $u";
        cmd.Parameters.AddWithValue("$u", userId);
        if (cmd.ExecuteScalar() is long value) currentLesson = value;
    }

    var lessons = new List<object>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = """
            SELECT lesson_id, completed, sketch
            FROM progress WHERE user_id = $u ORDER BY lesson_id
            """;
        cmd.Parameters.AddWithValue("$u", userId);
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            lessons.Add(new
            {
                lessonId = reader.GetInt64(0),
                completed = reader.GetInt64(1) != 0,
                sketch = reader.IsDBNull(2) ? null : reader.GetString(2),
            });
    }

    return Results.Ok(new { currentLesson, lessons });
}).RequireAuthorization();

app.MapPut("/api/progress/{lessonId:int}", (int lessonId, ProgressUpdate update, ClaimsPrincipal user) =>
{
    var userId = UserId(user);
    using var conn = Db.Open();

    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = """
            INSERT INTO progress (user_id, lesson_id, completed, sketch, updated_at)
            VALUES ($u, $l, $c, $s, $t)
            ON CONFLICT (user_id, lesson_id) DO UPDATE SET
                completed = MAX(progress.completed, excluded.completed),
                sketch = excluded.sketch,
                updated_at = excluded.updated_at
            """;
        cmd.Parameters.AddWithValue("$u", userId);
        cmd.Parameters.AddWithValue("$l", lessonId);
        cmd.Parameters.AddWithValue("$c", update.Completed ? 1 : 0);
        cmd.Parameters.AddWithValue("$s", (object?)update.Sketch ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$t", DateTime.UtcNow.ToString("o"));
        cmd.ExecuteNonQuery();
    }

    if (update.Current)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE users SET current_lesson = $l WHERE id = $u";
        cmd.Parameters.AddWithValue("$l", lessonId);
        cmd.Parameters.AddWithValue("$u", userId);
        cmd.ExecuteNonQuery();
    }

    return Results.NoContent();
}).RequireAuthorization();

app.Run();

record Credentials(string? Username, string? Password);

record ProgressUpdate(bool Completed, string? Sketch, bool Current);
