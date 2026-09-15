var builder = WebApplication.CreateBuilder(args);

// Allow the Vite dev server to call the API during development.
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

var dataDir = Path.Combine(AppContext.BaseDirectory, "Data");

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/components", () =>
    Results.Content(File.ReadAllText(Path.Combine(dataDir, "components.json")), "application/json"));

app.MapGet("/api/lessons", () =>
    Results.Content(File.ReadAllText(Path.Combine(dataDir, "lessons.json")), "application/json"));

app.Run();
