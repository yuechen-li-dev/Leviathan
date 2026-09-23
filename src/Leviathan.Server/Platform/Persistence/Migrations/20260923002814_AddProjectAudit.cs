using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Leviathan.Server.Platform.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectAudits",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    AccountId = table.Column<string>(type: "text", nullable: false),
                    AppInstallationId = table.Column<string>(type: "text", nullable: false),
                    ProjectId = table.Column<string>(type: "text", nullable: false),
                    ActorUserId = table.Column<string>(type: "text", nullable: false),
                    RevisionId = table.Column<string>(type: "text", nullable: false),
                    RequestId = table.Column<string>(type: "text", nullable: false),
                    Operation = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Result = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectAudits", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectAudits_AccountId_OccurredAt",
                table: "ProjectAudits",
                columns: new[] { "AccountId", "OccurredAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectAudits");
        }
    }
}
