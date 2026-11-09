using System.Diagnostics;

namespace SchoolAdmission.Api.Clients;

public sealed class RequestIdPropagationHandler : DelegatingHandler
{
    public const string RequestIdHeader = "X-Request-Id";

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var traceId = Activity.Current?.TraceId.ToHexString();
        if (!string.IsNullOrEmpty(traceId) && !request.Headers.Contains(RequestIdHeader))
        {
            request.Headers.Add(RequestIdHeader, traceId);
        }

        return base.SendAsync(request, cancellationToken);
    }
}
