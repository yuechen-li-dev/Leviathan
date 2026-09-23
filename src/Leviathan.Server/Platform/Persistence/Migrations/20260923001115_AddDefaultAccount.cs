using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Leviathan.Server.Platform.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDefaultAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultAccountId",
                table: "AspNetUsers",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultAccountId",
                table: "AspNetUsers");
        }
    }
}
