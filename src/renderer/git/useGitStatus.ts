import { useCallback, useEffect, useState } from "react";

import type { GitStatus } from "../../shared/git";

export function useGitStatus(refreshSignal: unknown) {
  const [status, setStatus] = useState<GitStatus>({ branch: null, changes: [], isRepository: false });

  const refresh = useCallback(async () => {
    setStatus(await window.aureum.git.status());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  return { status, refresh };
}
