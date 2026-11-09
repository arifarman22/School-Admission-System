using System.Net.Http.Headers;
using System.Text.Json;

namespace SchoolAdmission.Tests.Infrastructure;

public static class JsonAssert
{
    public static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response, string expectedMediaType = "application/json")
    {
        Assert.Equal(expectedMediaType, response.Content.Headers.ContentType?.MediaType);
        var text = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    public static void HasExactProperties(JsonElement element, params string[] expected)
    {
        Assert.Equal(JsonValueKind.Object, element.ValueKind);
        var actual = element.EnumerateObject().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal);
        Assert.Equal(expected.OrderBy(n => n, StringComparer.Ordinal), actual);
    }

    public static async Task<JsonElement> ReadProblemAsync(HttpResponseMessage response, int status, string code)
    {
        Assert.Equal(status, (int)response.StatusCode);
        var problem = await ReadJsonAsync(response, "application/problem+json");
        Assert.Equal(status, problem.GetProperty("status").GetInt32());
        Assert.Equal(code, problem.GetProperty("code").GetString());
        Assert.True(problem.TryGetProperty("title", out _));
        Assert.True(problem.TryGetProperty("traceId", out _));
        return problem;
    }

    public static StringContent JsonBody(string json) =>
        new(json, new MediaTypeHeaderValue("application/json"));
}
