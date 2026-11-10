using System.ComponentModel.DataAnnotations;

namespace SchoolAdmission.Api.Contracts;

public sealed class CreateClassRequest
{
    public const int MaxNameInputLength = 200;
    public const int MaxSectionInputLength = 40;
    public const string DefaultSection = "A";
    public const int MaxTotalSeats = 10_000;
    public const string ClassIdMessage = "classId must be a positive whole number";

    [Required(ErrorMessage = "name is required")]
    [StringLength(MaxNameInputLength, ErrorMessage = "name is too long")]
    public string? Name { get; init; }

    [StringLength(MaxSectionInputLength, ErrorMessage = "section is too long")]
    public string? Section { get; init; }

    [Required(ErrorMessage = "totalSeats is required")]
    [Range(1, MaxTotalSeats, ErrorMessage = "totalSeats must be between 1 and 10000")]
    public int? TotalSeats { get; init; }
}

public sealed record ClassCreatedResponse(int Id, string Name, string Section, int TotalSeats);

public sealed record ClassResponse(
    int Id,
    string Name,
    string Section,
    int TotalSeats,
    int HeldSeats,
    int ConfirmedSeats,
    int AvailableSeats);
