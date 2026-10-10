# GoalScheduler (shared artifact)

`goalscheduler.html` is GoalScheduler rebuilt as a single-page Claude artifact that a group of friends can share. It needs no server: the artifact runtime provides storage, identity and Claude.

Live: https://claude.ai/artifact/QnCxUJhMb3jathJSJhgFdS

## What's in it

- **Today**: three words for who you want to be, a Big 3 (with "Help me pick" from Claude), carried-over moves with a three-strikes nudge and "Break it down", morning gratitude, and an evening review on Brendon Burchard's six high performance habits (score out of 30).
- **Plan**: Week (pick 3–5 outcomes, schedule moves into days against a daily capacity, weekly review), Month (calendar with done/planned dots, goal deadlines and habit scores, a monthly intention), Year (theme, a vision per life area, deadlines across the twelve months).
- **Projects**: each project has a life area, an owner and a purpose, and holds goals and mini-projects. Each goal follows Tony Robbins' RPM: Result, Purpose, and a Massive Action Plan of moves, with key moves starred. "Suggest next goals" and "Plan moves with Claude" send the whole project's context, so new goals build on the ones already there.
- **Capture (+)**: add moves line by line, or "Sort with Claude" to chunk a brain dump into existing projects and goals, or into new ones.
- **Crew**: everyone's day at a glance (words, Big 3, score, streak), shortcuts to their week and projects, your daily capacity setting, and a short explainer of the method.

## Runtime capabilities

Declared at publish: `db` (shared data), `user` with the `profile` scope (names and avatars), and `sample` (Claude, billed to each viewer's own usage).

Data layout:

| Path | Who writes | Contents |
| --- | --- | --- |
| `projects/{id}` | anyone who can edit | title, why, area, ownerId, status |
| `goals/{id}` | anyone who can edit | projectId, kind (goal/mini), title, why, due, ownerId, status |
| `actions/{id}` | anyone who can edit | title, minutes, day, goalId, projectId, ownerId, key, done, carried, notes |
| `people/{uid}` | that person | joinedAt, capacity (minutes per day) |
| `people/{uid}/log/{key}` | that person | `d-YYYY-MM-DD` day page, `w-YYYY-MM-DD` week (Monday), `m-YYYY-MM` month, `y-YYYY` year |

Access rules: everyone reads everything; `people/{uid}` and below is writable only by that person (and the artifact owner).

## Sharing with friends

Open the artifact, use **Share**, and invite each friend by email as an **Editor**. Keep public link sharing off: people who join by link can only view and can't save their own plans.

## Editing

Edit `goalscheduler.html` and republish it to the same URL. Outside Claude (opened as a plain file) the page runs in a preview mode backed by in-memory storage, which is handy for local testing.
