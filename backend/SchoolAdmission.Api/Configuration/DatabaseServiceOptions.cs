using System.ComponentModel.DataAnnotations;

namespace SchoolAdmission.Api.Configuration;

public sealed class DatabaseServiceOptions
{
    public const string SectionName = "DatabaseService";
    public const string BaseUrlEnvironmentKey = "PRISMA_SERVICE_URL";
    public const string ApiKeyEnvironmentKey = "INTERNAL_API_KEY";

    [Required(ErrorMessage = "PRISMA_SERVICE_URL is required")]
    [Url(ErrorMessage = "PRISMA_SERVICE_URL must be an absolute URL")]
    public string BaseUrl { get; set; } = string.Empty;

    [Required(ErrorMessage = "INTERNAL_API_KEY is required")]
    [MinLength(16, ErrorMessage = "INTERNAL_API_KEY must be at least 16 characters")]
    public string ApiKey { get; set; } = string.Empty;

    [Range(1, 120)]
    public int TimeoutSeconds { get; set; } = 20;
}
