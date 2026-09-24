using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Leviathan.Server.Platform.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class HeliosDiscoveryX0 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HeliosPublications",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    ProjectId = table.Column<string>(type: "text", nullable: false),
                    AccountId = table.Column<string>(type: "text", nullable: false),
                    PublishedRevisionId = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Category = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    TagsJson = table.Column<string>(type: "text", nullable: false),
                    CreatorName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    PreviewObjectKey = table.Column<string>(type: "text", nullable: false),
                    Visibility = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HeliosPublications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HeliosPublications_ProjectRevisions_PublishedRevisionId",
                        column: x => x.PublishedRevisionId,
                        principalTable: "ProjectRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HeliosPublications_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HeliosPublications_ProjectId",
                table: "HeliosPublications",
                column: "ProjectId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HeliosPublications_PublishedRevisionId",
                table: "HeliosPublications",
                column: "PublishedRevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_HeliosPublications_Visibility_PublishedAt",
                table: "HeliosPublications",
                columns: new[] { "Visibility", "PublishedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HeliosPublications");
        }
    }
}
