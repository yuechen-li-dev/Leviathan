FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
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
