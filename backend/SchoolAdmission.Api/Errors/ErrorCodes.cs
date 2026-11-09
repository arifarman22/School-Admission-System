namespace SchoolAdmission.Api.Errors;

public static class ErrorCodes
{
    public const string ExtensionKey = "code";

    public const string ValidationError = "VALIDATION_ERROR";
    public const string StudentIdRequired = "STUDENT_ID_REQUIRED";
    public const string NotFound = "NOT_FOUND";
    public const string ClassNameTaken = "CLASS_NAME_TAKEN";
    public const string SeatsFull = "SEATS_FULL";
    public const string DuplicateApplication = "DUPLICATE_APPLICATION";
    public const string HoldNotOwned = "HOLD_NOT_OWNED";
    public const string HoldExpired = "HOLD_EXPIRED";
    public const string HoldNotActive = "HOLD_NOT_ACTIVE";
    public const string HoldAlreadyConfirmed = "HOLD_ALREADY_CONFIRMED";
    public const string ServiceBusy = "SERVICE_BUSY";
    public const string ServiceUnavailable = "SERVICE_UNAVAILABLE";
    public const string UpstreamTimeout = "UPSTREAM_TIMEOUT";
    public const string UpstreamError = "UPSTREAM_ERROR";
    public const string MethodNotAllowed = "METHOD_NOT_ALLOWED";
    public const string UnsupportedMediaType = "UNSUPPORTED_MEDIA_TYPE";
    public const string InternalError = "INTERNAL_ERROR";

    public static string ForStatus(int status) => status switch
    {
        StatusCodes.Status400BadRequest => ValidationError,
        StatusCodes.Status401Unauthorized => StudentIdRequired,
        StatusCodes.Status404NotFound => NotFound,
        StatusCodes.Status405MethodNotAllowed => MethodNotAllowed,
        StatusCodes.Status415UnsupportedMediaType => UnsupportedMediaType,
        StatusCodes.Status503ServiceUnavailable => ServiceUnavailable,
        _ when status >= 500 => InternalError,
        _ => $"HTTP_{status}",
    };
}
