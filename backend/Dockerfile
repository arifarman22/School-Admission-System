# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY Directory.Build.props SchoolAdmission.sln ./
COPY SchoolAdmission.Api/SchoolAdmission.Api.csproj SchoolAdmission.Api/
COPY SchoolAdmission.Tests/SchoolAdmission.Tests.csproj SchoolAdmission.Tests/
RUN dotnet restore SchoolAdmission.sln
COPY . .
RUN dotnet test SchoolAdmission.sln -c Release --no-restore \
 && dotnet publish SchoolAdmission.Api/SchoolAdmission.Api.csproj -c Release --no-restore -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1
COPY --from=build /app/publish .
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "SchoolAdmission.Api.dll"]
