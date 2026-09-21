import { FileDiff } from "lucide-react";

import type { GitChange } from "../../shared/git";

type GitChangesProps = {
  changes: GitChange[];
};

const labels: Record<GitChange["status"], string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  untracked: "U",
};

export function GitChanges({ changes }: GitChangesProps) {
  return (
    <div className="change-summary">
      <div className="change-summary__head">
        <span><FileDiff size={13} /> Git changes</span>
        <span className="change-summary__count">{changes.length}</span>
      </div>
      {changes.length === 0 ? (
        <div className="change-summary__row"><span className="file-type file-type--tsx">OK</span> Clean workspace <span>0</span></div>
      ) : (
        changes.slice(0, 6).map((change) => (
          <div className="change-summary__row" key={`${change.area}-${change.status}-${change.path}`}>
            <span className="file-type file-type--tsx">{labels[change.status]}</span>
            {change.path}
            <span>{change.area}</span>
          </div>
        ))
      )}
    </div>
  );
}
