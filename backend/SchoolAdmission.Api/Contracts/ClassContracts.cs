using System.ComponentModel.DataAnnotations;

namespace SchoolAdmission.Api.Contracts;

public sealed class CreateClassRequest
{
    public const int MaxNameInputLength = 200;
    public const int MaxTotalSeats = 10_000;

    [Required(ErrorMessage = "name is required")]
    [StringLength(MaxNameInputLength, ErrorMessage = "name is too long")]
    public string? Name { get; init; }

    [Required(ErrorMessage = "totalSeats is required")]
    [Range(1, MaxTotalSeats, ErrorMessage = "totalSeats must be between 1 and 10000")]
    public int? TotalSeats { get; init; }
}

public sealed record ClassCreatedResponse(string Id, string Name, int TotalSeats);

public sealed record ClassResponse(
    string Id,
    string Name,
    int TotalSeats,
    int HeldSeats,
    int ConfirmedSeats,
    int AvailableSeats);
