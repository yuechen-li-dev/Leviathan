FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Build with: docker build --build-context dominatus=../Dominatus .
# Dominatus is a source dependency until the conversation API package is published.
COPY --from=dominatus /src /Dominatus/src
COPY --from=dominatus /README.md /Dominatus/README.md
COPY global.json ./
COPY src/Leviathan.Server/Leviathan.Server.csproj src/Leviathan.Server/
RUN dotnet restore src/Leviathan.Server/Leviathan.Server.csproj
COPY src/Leviathan.Server src/Leviathan.Server
COPY vendor/Dominatus/src/Ariadne.Console/Scripts/RustSimulator.cs vendor/Dominatus/src/Ariadne.Console/Scripts/RustSimulator.cs
RUN dotnet publish src/Leviathan.Server/Leviathan.Server.csproj -c Release --no-restore -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Leviathan.Server.dll"]
