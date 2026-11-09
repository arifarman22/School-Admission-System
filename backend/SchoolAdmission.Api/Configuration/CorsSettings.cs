namespace SchoolAdmission.Api.Configuration;

public static class CorsSettings
{
    public const string PolicyName = "Frontend";
    public const string ConfigKey = "Cors:AllowedOrigins";

    public static string[] ParseOrigins(string? raw) =>
        (raw ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
