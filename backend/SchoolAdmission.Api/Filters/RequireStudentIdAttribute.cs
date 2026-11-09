using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using SchoolAdmission.Api.Errors;

namespace SchoolAdmission.Api.Filters;

[AttributeUsage(AttributeTargets.Method)]
public sealed class RequireStudentIdAttribute : ActionFilterAttribute
{
    public const string HeaderName = "X-Student-Id";
    public const int StudentIdLength = 17;
    private const string ItemKey = "SchoolAdmission.StudentId";

    public override void OnActionExecuting(ActionExecutingContext context)
    {
        var httpContext = context.HttpContext;
        var values = httpContext.Request.Headers[HeaderName];
        var factory = httpContext.RequestServices.GetRequiredService<ProblemDetailsFactory>();

        if (values.Count == 0 || string.IsNullOrEmpty(values[0]))
        {
            var problem = factory.CreateProblemDetails(
                httpContext,
                StatusCodes.Status401Unauthorized,
                title: "Student identification required",
                detail: $"The {HeaderName} header is required for this operation.");
            problem.Extensions[ErrorCodes.ExtensionKey] = ErrorCodes.StudentIdRequired;
            context.Result = ProblemResult(problem);
            return;
        }

        if (values.Count > 1 || !IsValidStudentId(values[0]))
        {
            var modelState = new Microsoft.AspNetCore.Mvc.ModelBinding.ModelStateDictionary();
            modelState.AddModelError(HeaderName, $"{HeaderName} must be exactly {StudentIdLength} digits.");
            var problem = factory.CreateValidationProblemDetails(httpContext, modelState, StatusCodes.Status400BadRequest);
            problem.Extensions[ErrorCodes.ExtensionKey] = ErrorCodes.ValidationError;
            context.Result = ProblemResult(problem);
            return;
        }

        httpContext.Items[ItemKey] = values[0];
    }

    public static string GetStudentId(HttpContext httpContext) =>
        httpContext.Items[ItemKey] as string
        ?? throw new InvalidOperationException($"{nameof(RequireStudentIdAttribute)} must be applied to this action.");

    public static bool IsValidStudentId(string? value) =>
        value is { Length: StudentIdLength } && value.All(char.IsAsciiDigit);

    private static ObjectResult ProblemResult(ProblemDetails problem) =>
        new(problem) { StatusCode = problem.Status, ContentTypes = { "application/problem+json" } };
}
