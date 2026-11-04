import type {
  ReviewSkillReport,
  FindingSkillReport,
} from "@/lib/agentic-sdlc/review-skills.mjs";

type Skill = ReviewSkillReport["used"][number];
function Badges({ skills }: { skills: Skill[] }) {
  return (
    <>
      {skills.map((skill) => (
        <a
          key={skill.id}
          href={skill.url}
          target="_blank"
          rel="noreferrer"
          title={`${skill.role}. Adapted review method; attribution is reported by the reviewer.`}
          className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs text-foreground hover:border-primary hover:text-primary"
        >
          {skill.name}
        </a>
      ))}
    </>
  );
}

export function ReviewSkills({
  report,
}: {
  report?: ReviewSkillReport | null;
}) {
  return (
    <section
      aria-label="Skills used in this review"
      className="space-y-1.5 text-xs"
    >
      <p className="font-medium text-muted-foreground">
        Skills used <span className="font-normal">· reviewer reported</span>
      </p>
      {report?.status === "reported" ? (
        report.used.length ? (
          <div className="flex flex-wrap gap-1.5">
            <Badges skills={report.used} />
          </div>
        ) : (
          <p className="text-muted-foreground">No skill methods reported.</p>
        )
      ) : (
        <p className="text-muted-foreground">
          {report?.status === "unverified"
            ? "Skill attribution could not be verified."
            : "Skill usage was not recorded for this review."}
        </p>
      )}
    </section>
  );
}

export function FindingSkills({
  report,
}: {
  report?: FindingSkillReport | null;
}) {
  if (!report) return null;
  if (report.status !== "reported")
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {report.status === "unverified"
          ? "Finding skill attribution could not be verified."
          : "Finding skill attribution was not recorded."}
      </p>
    );
  return (
    <section
      aria-label="Finding skill attribution"
      className="mt-3 space-y-2 text-xs"
    >
      <p className="text-muted-foreground">
        Reviewer attribution · recorded at{" "}
        <code>{report.headSha?.slice(0, 12)}</code>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">Discovery:</span>
        {report.foundBy.length ? (
          <Badges skills={report.foundBy} />
        ) : (
          <span className="text-muted-foreground">Not recorded</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">Verification:</span>
        {report.verifiedBy.length ? (
          <Badges skills={report.verifiedBy} />
        ) : (
          <span className="text-muted-foreground">Not recorded</span>
        )}
      </div>
    </section>
  );
}
