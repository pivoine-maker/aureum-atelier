# Git Graph Design

## Goal
Add a compact Git commit graph to the Git Repository panel so users can inspect recent commit history without leaving Aureum Atelier.

## Placement
The graph appears inside the Git Repository panel directly below the branch header and above the commit message box. It is visible only when the current workspace is a Git repository.

## Data
AA reads the latest 30 commits using `git log --graph --decorate --date=iso-strict --pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%ad%x1f%D%x1f%s --max-count=30`. Each item keeps:
- full hash and short hash
- parent hashes
- author name
- ISO commit date
- decoration string for branch/tag labels
- subject
- graph prefix from Git's ASCII graph output

## Empty States
If the workspace is not a Git repository, the existing `No Git repository` state remains. If the workspace is a Git repository with no commits, the graph shows `No commits yet` and leaves the existing commit workflow available.

## Interaction
The graph section is collapsible with a header button. It defaults open and shows the number of commits loaded. The refresh button in the branch header refreshes both status and history. Each commit row is read-only for this iteration.

## Visual Style
The graph uses the existing dark/gold source-control palette. The ASCII graph prefix is rendered in mono font as the left rail; short hash and refs are accent chips; subject, author, and relative time are readable on one row with truncation.

## Out of Scope
This iteration does not implement checkout, cherry-pick, reset, branch creation, or commit details modal. Those actions can be added later once the read-only graph is stable.
