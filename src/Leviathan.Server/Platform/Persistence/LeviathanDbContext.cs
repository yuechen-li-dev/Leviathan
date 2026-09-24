using Leviathan.Server.Platform.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Leviathan.Server.Platform.Persistence;

public sealed class LeviathanUser : Microsoft.AspNetCore.Identity.IdentityUser
{
    public string DisplayName { get; set; } = "";
    public string DefaultAccountId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class LeviathanAccount
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class LeviathanMembership
{
    public string AccountId { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Role { get; set; } = "Member";
    public DateTimeOffset JoinedAt { get; set; }
}

public sealed class LeviathanInstallation
{
    public string Id { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string AppId { get; set; } = "";
    public string Status { get; set; } = "active";
    public string InstalledBy { get; set; } = "";
    public DateTimeOffset InstalledAt { get; set; }
}

public sealed class LeviathanProject
{
    public string Id { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string AppInstallationId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Status { get; set; } = "active";
    public string CreatedBy { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string CurrentRevisionId { get; set; } = "";
}

public sealed class LeviathanProjectRevision
{
    public string Id { get; set; } = "";
    public string ProjectId { get; set; } = "";
    public string SourceObjectKey { get; set; } = "";
    public string ContentHash { get; set; } = "";
    public string CreatedBy { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class LeviathanProjectAudit
{
    public string Id { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string AppInstallationId { get; set; } = "";
    public string ProjectId { get; set; } = "";
    public string ActorUserId { get; set; } = "";
    public string RevisionId { get; set; } = "";
    public string RequestId { get; set; } = "";
    public string Operation { get; set; } = "";
    public string Result { get; set; } = "";
    public DateTimeOffset OccurredAt { get; set; }
}

public sealed class HeliosPublication
{
    public string Id { get; set; } = "";
    public string ProjectId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string PublishedRevisionId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "Mechanical";
    public string TagsJson { get; set; } = "[]";
    public string CreatorName { get; set; } = "";
    public string PreviewObjectKey { get; set; } = "";
    public string Visibility { get; set; } = "Public";
    public DateTimeOffset PublishedAt { get; set; }
}

public sealed class LeviathanDbContext(DbContextOptions<LeviathanDbContext> options) : IdentityDbContext<LeviathanUser>(options)
{
    public DbSet<LeviathanAccount> Accounts => Set<LeviathanAccount>();
    public DbSet<LeviathanMembership> Memberships => Set<LeviathanMembership>();
    public DbSet<LeviathanInstallation> Installations => Set<LeviathanInstallation>();
    public DbSet<LeviathanProject> Projects => Set<LeviathanProject>();
    public DbSet<LeviathanProjectRevision> ProjectRevisions => Set<LeviathanProjectRevision>();
    public DbSet<LeviathanProjectAudit> ProjectAudits => Set<LeviathanProjectAudit>();
    public DbSet<HeliosPublication> HeliosPublications => Set<HeliosPublication>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        base.OnModelCreating(model);
        model.Entity<LeviathanUser>(b => { b.Property(x => x.DisplayName).HasMaxLength(120); b.Property(x => x.DefaultAccountId).HasMaxLength(80); b.Property(x => x.CreatedAt); });
        model.Entity<LeviathanAccount>(b => { b.HasKey(x => x.Id); b.Property(x => x.Name).HasMaxLength(120); });
        model.Entity<LeviathanMembership>(b => { b.HasKey(x => new { x.AccountId, x.UserId }); b.Property(x => x.Role).HasMaxLength(20); b.HasOne<LeviathanAccount>().WithMany().HasForeignKey(x => x.AccountId); b.HasOne<LeviathanUser>().WithMany().HasForeignKey(x => x.UserId); });
        model.Entity<LeviathanInstallation>(b => { b.HasKey(x => x.Id); b.HasIndex(x => new { x.AccountId, x.AppId }).IsUnique(); b.Property(x => x.AppId).HasMaxLength(100); b.Property(x => x.Status).HasMaxLength(24); b.HasOne<LeviathanAccount>().WithMany().HasForeignKey(x => x.AccountId); });
        model.Entity<LeviathanProject>(b => { b.HasKey(x => x.Id); b.HasIndex(x => new { x.AccountId, x.AppInstallationId, x.Status }); b.Property(x => x.Name).HasMaxLength(160); b.Property(x => x.Status).HasMaxLength(24); b.HasOne<LeviathanAccount>().WithMany().HasForeignKey(x => x.AccountId); b.HasOne<LeviathanInstallation>().WithMany().HasForeignKey(x => x.AppInstallationId); });
        model.Entity<LeviathanProjectRevision>(b => { b.HasKey(x => x.Id); b.HasIndex(x => x.ProjectId); b.Property(x => x.ContentHash).HasMaxLength(64); b.HasOne<LeviathanProject>().WithMany().HasForeignKey(x => x.ProjectId); });
        model.Entity<LeviathanProjectAudit>(b => { b.HasKey(x => x.Id); b.HasIndex(x => new { x.AccountId, x.OccurredAt }); b.Property(x => x.Operation).HasMaxLength(24); b.Property(x => x.Result).HasMaxLength(24); });
        model.Entity<HeliosPublication>(b => { b.HasKey(x => x.Id); b.HasIndex(x => x.ProjectId).IsUnique(); b.HasIndex(x => new { x.Visibility, x.PublishedAt }); b.Property(x => x.Title).HasMaxLength(160); b.Property(x => x.Description).HasMaxLength(2000); b.Property(x => x.Category).HasMaxLength(40); b.Property(x => x.CreatorName).HasMaxLength(120); b.Property(x => x.Visibility).HasMaxLength(16); b.HasOne<LeviathanProject>().WithMany().HasForeignKey(x => x.ProjectId); b.HasOne<LeviathanProjectRevision>().WithMany().HasForeignKey(x => x.PublishedRevisionId).OnDelete(DeleteBehavior.Restrict); });
    }
}
