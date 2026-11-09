namespace SchoolAdmission.Api.Errors;

public sealed record PublicError(int Status, string Title, bool ExposeDetail);

public static class DomainErrorMapping
{
    private static readonly Dictionary<string, PublicError> Map = new(StringComparer.Ordinal)
    {
        [ErrorCodes.ValidationError] = new(StatusCodes.Status400BadRequest, "Validation failed", true),
        [ErrorCodes.NotFound] = new(StatusCodes.Status404NotFound, "Not found", true),
        [ErrorCodes.ClassNameTaken] = new(StatusCodes.Status409Conflict, "Class name already exists", true),
        [ErrorCodes.SeatsFull] = new(StatusCodes.Status409Conflict, "No seats available", true),
        [ErrorCodes.DuplicateApplication] = new(StatusCodes.Status409Conflict, "Active application already exists", true),
        [ErrorCodes.AlreadyAdmitted] = new(StatusCodes.Status409Conflict, "Student already admitted to another class", true),
        [ErrorCodes.HoldExpired] = new(StatusCodes.Status409Conflict, "Hold has expired", true),
        [ErrorCodes.HoldNotActive] = new(StatusCodes.Status409Conflict, "Hold is no longer active", true),
        [ErrorCodes.HoldAlreadyConfirmed] = new(StatusCodes.Status409Conflict, "Hold is already confirmed", true),
        [ErrorCodes.HoldNotOwned] = new(StatusCodes.Status403Forbidden, "Hold belongs to another student", true),
        [ErrorCodes.ServiceBusy] = new(StatusCodes.Status503ServiceUnavailable, "Service busy, please retry", false),
        ["DATABASE_UNAVAILABLE"] = new(StatusCodes.Status503ServiceUnavailable, "Service temporarily unavailable", false),
    };

    private static readonly PublicError Fallback =
        new(StatusCodes.Status502BadGateway, "Admission service error", false);

    public static (PublicError Error, string PublicCode) Resolve(string internalCode)
    {
        if (Map.TryGetValue(internalCode, out var mapped))
        {
            var publicCode = internalCode == "DATABASE_UNAVAILABLE" ? ErrorCodes.ServiceUnavailable : internalCode;
            return (mapped, publicCode);
        }

        return (Fallback, ErrorCodes.UpstreamError);
    }
}
