using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using SchoolAdmission.Api.Clients;

namespace SchoolAdmission.Api.Errors;

public sealed class UpstreamExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ProblemDetailsFactory problemDetailsFactory,
    ILogger<UpstreamExceptionHandler> logger) : IExceptionHandler
{
    private const string RetryAfterSeconds = "1";

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var problem = exception switch
        {
            DatabaseServiceException dse => FromDomainError(httpContext, dse),
            HttpRequestException => Create(
                httpContext,
                StatusCodes.Status503ServiceUnavailable,
                "Admission service unavailable",
                ErrorCodes.ServiceUnavailable),
            TaskCanceledException when !httpContext.RequestAborted.IsCancellationRequested => Create(
                httpContext,
                StatusCodes.Status504GatewayTimeout,
                "Admission service timed out",
                ErrorCodes.UpstreamTimeout),
            _ => null,
        };

        if (problem is null)
        {
            return false;
        }

        var status = problem.Status ?? StatusCodes.Status500InternalServerError;
        if (status >= 500)
        {
            logger.LogError(exception, "Upstream failure mapped to {Status}", status);
        }
        else
        {
            logger.LogInformation("Domain error {Code} mapped to {Status}", problem.Extensions[ErrorCodes.ExtensionKey], status);
        }

        httpContext.Response.StatusCode = status;
        if (status == StatusCodes.Status503ServiceUnavailable)
        {
            httpContext.Response.Headers.RetryAfter = RetryAfterSeconds;
        }

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    private ProblemDetails FromDomainError(HttpContext httpContext, DatabaseServiceException exception)
    {
        var (mapped, publicCode) = DomainErrorMapping.Resolve(exception.Code);

        if (publicCode == ErrorCodes.ValidationError)
        {
            var modelState = new ModelStateDictionary();
            foreach (var issue in exception.Details)
            {
                modelState.AddModelError(issue.Path, issue.Message);
            }

            if (modelState.ErrorCount == 0)
            {
                modelState.AddModelError(string.Empty, exception.Message);
            }

            var validation = problemDetailsFactory.CreateValidationProblemDetails(httpContext, modelState, mapped.Status);
            validation.Extensions[ErrorCodes.ExtensionKey] = publicCode;
            return validation;
        }

        return Create(
            httpContext,
            mapped.Status,
            mapped.Title,
            publicCode,
            mapped.ExposeDetail ? exception.Message : null);
    }

    private ProblemDetails Create(HttpContext httpContext, int status, string title, string code, string? detail = null)
    {
        var problem = problemDetailsFactory.CreateProblemDetails(httpContext, status, title, detail: detail);
        problem.Extensions[ErrorCodes.ExtensionKey] = code;
        return problem;
    }
}
