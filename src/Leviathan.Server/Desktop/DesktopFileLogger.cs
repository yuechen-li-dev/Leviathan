namespace Leviathan.Server.Desktop;

/// <summary>Bounded local diagnostic log. Console stays a readable launcher, not a server trace.</summary>
internal sealed class DesktopFileLogger : ILoggerProvider
{
    private readonly StreamWriter writer;
    private readonly object gate = new();
    public DesktopFileLogger(string directory)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "helios.log");
        if (File.Exists(path) && new FileInfo(path).Length > 10 * 1024 * 1024) File.Move(path, path + ".previous", overwrite: true);
        writer = new StreamWriter(path, append: true) { AutoFlush = true };
    }
    public ILogger CreateLogger(string categoryName) => new Logger(this, categoryName);
    public void Dispose() { lock (gate) writer.Dispose(); }
    private sealed class Logger(DesktopFileLogger owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;
        public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            lock (owner.gate) owner.writer.WriteLine($"{DateTimeOffset.Now:O} {level} {category}: {formatter(state, exception)} {exception}");
        }
    }
}
