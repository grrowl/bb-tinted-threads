# bb-plugin-tinted-threads

A bb plugin that contributes a replacement sidebar thread list named
`Tinted Threads`.

![Tinted Threads sidebar showing active, blocked, and idle thread rows](docs/screenshot.png)

Rows group by project, by environment, or not at all (flat), use a red hue when a thread is blocked on
input or failed, and use a subtle green hue while work is active. Sub-threads
render directly beneath their parent with a simple depth indent. Right-clicking
a row opens a thread actions menu, including **Open pull request** when one
exists.

A parent thread shows a **sub-thread count** with a chevron — click it to
collapse or expand its children (the state is saved per install). A running
thread also shows a **subagent count** when it has background agents in flight.

When the list is flat (ungrouped) — or in the cross-project pinned strip —
each row is captioned with its project name, so sorting the whole list by
attention or update time never loses track of where a thread lives.

Choose **Sort by → manual** to arrange threads by hand: drag a row up or down
(or press **Alt+↑ / Alt+↓** with a row focused) to reorder it within its group.
The order is saved per install and stays put across restarts. Freshly created
threads surface at the top until you place them. (A sideways drag toward the
main area still opens the thread in a split, as everywhere else.)

Configure the list under **Extensions → Plugins → Tinted Threads**:

- **Group by** — `project`, `environment`, or `none`. Environment sections are
  headed "Repo · env" and ordered by their top thread under the active sort;
  environments with a single thread (and threads with no environment) fold into
  one **Threads** section, with each row captioned "Repo · env".
- **Pinned threads** — keep pins inside each group (`in-group`) or in a
  cross-project section at the top (`at-top`)
- **Sort by** — created, updated, attention, title, or manual (drag to arrange)
- **Show archived child threads** — nested archived sub-threads under a visible
  parent
- **Subtitle columns** — provider/model, uncommitted diff (off by default), PR
  status, and workspace label mode (branch, worktree, host, or smart fallback)

## Use

Install or reload the local plugin:

```sh
npm install --include=dev --cache .npm-cache
bb plugin install . --yes
bb plugin reload tinted-threads
```

Then select `Tinted Threads` in Settings → Appearance → Sidebar.

## Verify

```sh
npm test
npx tsc --noEmit
bb plugin build .
bb plugin list
```
